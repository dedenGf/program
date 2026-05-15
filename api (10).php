<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, DELETE, PUT, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$host     = "localhost";
$db_name  = "digiduho_NexFinance";
$username = "digiduho_NexFinance";
$password = "digiduho_NexFinance";

try {
    $conn = new PDO("mysql:host=" . $host . ";dbname=" . $db_name . ";charset=utf8mb4", $username, $password);
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch(PDOException $e) {
    http_response_code(500);
    echo json_encode(["error" => "Koneksi database gagal: " . $e->getMessage()]);
    exit();
}

$action = isset($_GET['action']) ? $_GET['action'] : '';
$input  = json_decode(file_get_contents("php://input"), true) ?? [];

switch ($action) {

    // ============================================================
    // TRANSACTIONS
    // ============================================================
    case 'get_transactions':
        $stmt = $conn->query("SELECT * FROM transactions ORDER BY transaction_date DESC, id DESC");
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
        break;

    case 'add_transaction':
        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            $stmt = $conn->prepare("INSERT INTO transactions (title, amount, type, category, transaction_date) VALUES (:title, :amount, :type, :category, :date)");
            $stmt->execute([
                ':title'    => $input['title'],
                ':amount'   => $input['amount'],
                ':type'     => $input['type'],
                ':category' => $input['category'],
                ':date'     => $input['date']
            ]);
            echo json_encode(["message" => "Transaksi tersimpan", "id" => $conn->lastInsertId()]);
        }
        break;

    case 'update_transaction':
        if ($_SERVER['REQUEST_METHOD'] === 'PUT' && isset($_GET['id'])) {
            $stmt = $conn->prepare("UPDATE transactions SET title=:title, amount=:amount, type=:type, category=:category, transaction_date=:date WHERE id=:id");
            $stmt->execute([
                ':title'    => $input['title'],
                ':amount'   => $input['amount'],
                ':type'     => $input['type'],
                ':category' => $input['category'],
                ':date'     => $input['date'],
                ':id'       => $_GET['id']
            ]);
            echo json_encode(["message" => "Transaksi diperbarui"]);
        }
        break;

    case 'delete_transaction':
        if ($_SERVER['REQUEST_METHOD'] === 'DELETE' && isset($_GET['id'])) {
            $stmt = $conn->prepare("DELETE FROM transactions WHERE id = :id");
            $stmt->execute([':id' => $_GET['id']]);
            echo json_encode(["message" => "Transaksi dihapus"]);
        }
        break;

    case 'get_summary':
        $stmt = $conn->query("SELECT SUM(CASE WHEN type='income' THEN amount ELSE 0 END) as total_income, SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) as total_expense FROM transactions");
        $row  = $stmt->fetch(PDO::FETCH_ASSOC);
        $inc  = (float)($row['total_income'] ?? 0);
        $exp  = (float)($row['total_expense'] ?? 0);
        echo json_encode(["income" => $inc, "expense" => $exp, "balance" => $inc - $exp]);
        break;

    // ============================================================
    // DOCUMENTS
    // ============================================================
    case 'get_documents':
        $stmt = $conn->query("SELECT *, DATE_FORMAT(due_date,'%Y-%m-%d') as due_date_fmt FROM documents ORDER BY due_date ASC, id DESC");
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $rows = array_map(function($r) {
            return [
                'id'         => (int)$r['id'],
                'title'      => $r['title'],
                'entity'     => $r['entity'],
                'amount'     => (float)$r['amount'],
                'paidAmount' => (float)$r['paid_amount'],
                'type'       => $r['type'],
                'status'     => $r['status'],
                'dueDate'    => $r['due_date_fmt'],
                'notes'      => $r['notes'] ?? '',
                'subtotal'   => (float)($r['subtotal'] ?? $r['amount']),
                'discountAmt'=> (float)($r['discount_amt'] ?? 0),
                'taxAmt'     => (float)($r['tax_amt'] ?? 0),
                'taxPercent' => (float)($r['tax_percent'] ?? 0),
                'items'      => $r['items_json'] ? json_decode($r['items_json'], true) : null,
            ];
        }, $rows);
        echo json_encode($rows);
        break;

    case 'add_document':
        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            // Cek apakah kolom extra sudah ada, kalau belum tetap insert minimal
            $cols = "title, entity, amount, paid_amount, type, status, due_date";
            $vals = ":title, :entity, :amount, 0, :type, 'pending', :due_date";
            $params = [
                ':title'    => $input['title'],
                ':entity'   => $input['entity'],
                ':amount'   => $input['amount'],
                ':type'     => $input['type'],
                ':due_date' => $input['dueDate'],
            ];
            // Optional extra fields jika kolom sudah ada di DB
            $extraFields = ['notes','subtotal','discount_amt','tax_amt','tax_percent','items_json'];
            $extraMap = [
                'notes'       => $input['notes'] ?? '',
                'subtotal'    => $input['subtotal'] ?? $input['amount'],
                'discount_amt'=> $input['discountAmt'] ?? 0,
                'tax_amt'     => $input['taxAmt'] ?? 0,
                'tax_percent' => $input['taxPercent'] ?? 0,
                'items_json'  => isset($input['items']) ? json_encode($input['items']) : null,
            ];

            // Cek kolom yang ada di tabel
            $colCheck = $conn->query("SHOW COLUMNS FROM documents")->fetchAll(PDO::FETCH_COLUMN);
            foreach ($extraFields as $f) {
                if (in_array($f, $colCheck)) {
                    $cols   .= ", $f";
                    $vals   .= ", :$f";
                    $params[":$f"] = $extraMap[$f];
                }
            }

            $stmt = $conn->prepare("INSERT INTO documents ($cols) VALUES ($vals)");
            $stmt->execute($params);
            echo json_encode(["message" => "Dokumen tersimpan", "id" => $conn->lastInsertId()]);
        }
        break;

    case 'update_document_payment':
        if ($_SERVER['REQUEST_METHOD'] === 'PUT' && isset($_GET['id'])) {
            $stmt = $conn->prepare("UPDATE documents SET paid_amount=:paid_amount, status=:status WHERE id=:id");
            $stmt->execute([
                ':paid_amount' => $input['paidAmount'],
                ':status'      => $input['status'],
                ':id'          => $_GET['id']
            ]);
            echo json_encode(["message" => "Dokumen diperbarui"]);
        }
        break;

    case 'update_document_status':
        if ($_SERVER['REQUEST_METHOD'] === 'PUT' && isset($_GET['id'])) {
            $stmt = $conn->prepare("UPDATE documents SET status=:status WHERE id=:id");
            $stmt->execute([':status' => $input['status'], ':id' => $_GET['id']]);
            echo json_encode(["message" => "Status dokumen diperbarui"]);
        }
        break;

    case 'delete_document':
        if ($_SERVER['REQUEST_METHOD'] === 'DELETE' && isset($_GET['id'])) {
            $stmt = $conn->prepare("DELETE FROM documents WHERE id=:id");
            $stmt->execute([':id' => $_GET['id']]);
            echo json_encode(["message" => "Dokumen dihapus"]);
        }
        break;

    // ============================================================
    // CATEGORIES
    // ============================================================
    case 'get_categories':
        $stmt = $conn->query("SELECT name FROM categories ORDER BY name ASC");
        $cats = $stmt->fetchAll(PDO::FETCH_COLUMN);
        echo json_encode($cats);
        break;

    case 'add_category':
        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            // Ignore duplikat karena ada UNIQUE KEY
            $stmt = $conn->prepare("INSERT IGNORE INTO categories (name) VALUES (:name)");
            $stmt->execute([':name' => $input['name']]);
            echo json_encode(["message" => "Kategori ditambahkan"]);
        }
        break;

    case 'delete_category':
        if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
            $stmt = $conn->prepare("DELETE FROM categories WHERE name=:name");
            $stmt->execute([':name' => $_GET['name']]);
            echo json_encode(["message" => "Kategori dihapus"]);
        }
        break;

    // ============================================================
    // COMPANY PROFILE
    // ============================================================
    case 'get_company_profile':
        $stmt = $conn->query("SELECT * FROM company_profile WHERE id=1 LIMIT 1");
        $row  = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row) {
            echo json_encode([
                'name'            => $row['name'],
                'address'         => $row['address'],
                'email'           => $row['email'],
                'logo'            => $row['logo_base64'],
                'bankName'        => $row['bank_name'],
                'bankAccount'     => $row['bank_account'],
                'bankAccountName' => $row['bank_account_name'],
            ]);
        } else {
            echo json_encode(null);
        }
        break;

    case 'update_company_profile':
        if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
            // Upsert: update jika ada, insert jika belum
            $stmt = $conn->prepare("
                INSERT INTO company_profile (id, name, address, email, logo_base64, bank_name, bank_account, bank_account_name)
                VALUES (1, :name, :address, :email, :logo, :bank_name, :bank_account, :bank_account_name)
                ON DUPLICATE KEY UPDATE
                    name=VALUES(name), address=VALUES(address), email=VALUES(email),
                    logo_base64=VALUES(logo_base64), bank_name=VALUES(bank_name),
                    bank_account=VALUES(bank_account), bank_account_name=VALUES(bank_account_name)
            ");
            $stmt->execute([
                ':name'             => $input['name'],
                ':address'          => $input['address'],
                ':email'            => $input['email'],
                ':logo'             => $input['logo'] ?? null,
                ':bank_name'        => $input['bankName'],
                ':bank_account'     => $input['bankAccount'],
                ':bank_account_name'=> $input['bankAccountName'],
            ]);
            echo json_encode(["message" => "Profil perusahaan disimpan"]);
        }
        break;

    // ============================================================
    // USERS
    // ============================================================
    case 'get_users':
        $stmt = $conn->query("SELECT id, username, password, name, phone, role, avatar FROM users ORDER BY id ASC");
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $rows = array_map(function($r) {
            return ['id'=>(int)$r['id'], 'username'=>$r['username'], 'password'=>$r['password'], 'name'=>$r['name'], 'phone'=>$r['phone'], 'role'=>$r['role'], 'avatar'=>$r['avatar']];
        }, $rows);
        echo json_encode($rows);
        break;

    case 'add_user':
        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            $stmt = $conn->prepare("INSERT INTO users (username, password, name, phone, role, avatar) VALUES (:username, :password, :name, :phone, :role, :avatar)");
            $stmt->execute([
                ':username' => $input['username'],
                ':password' => $input['password'],
                ':name'     => $input['name'],
                ':phone'    => $input['phone'] ?? '',
                ':role'     => $input['role'] ?? 'staff',
                ':avatar'   => $input['avatar'] ?? explode(' ', $input['name'])[0],
            ]);
            echo json_encode(["message" => "User ditambahkan", "id" => $conn->lastInsertId()]);
        }
        break;

    case 'update_user':
        if ($_SERVER['REQUEST_METHOD'] === 'PUT' && isset($_GET['id'])) {
            $stmt = $conn->prepare("UPDATE users SET name=:name, phone=:phone, password=:password, role=:role WHERE id=:id");
            $stmt->execute([
                ':name'     => $input['name'],
                ':phone'    => $input['phone'] ?? '',
                ':password' => $input['password'],
                ':role'     => $input['role'],
                ':id'       => $_GET['id']
            ]);
            echo json_encode(["message" => "User diperbarui"]);
        }
        break;

    case 'delete_user':
        if ($_SERVER['REQUEST_METHOD'] === 'DELETE' && isset($_GET['id'])) {
            $stmt = $conn->prepare("DELETE FROM users WHERE id=:id AND username != 'admin'");
            $stmt->execute([':id' => $_GET['id']]);
            echo json_encode(["message" => "User dihapus"]);
        }
        break;

    case 'login':
        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            $stmt = $conn->prepare("SELECT id, username, name, phone, role, avatar FROM users WHERE username=:username AND password=:password LIMIT 1");
            $stmt->execute([':username' => $input['username'], ':password' => $input['password']]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($user) {
                echo json_encode(["success" => true, "user" => $user]);
            } else {
                http_response_code(401);
                echo json_encode(["success" => false, "message" => "Username atau password salah"]);
            }
        }
        break;

    default:
        echo json_encode(["message" => "NexFinance API V4 is running.", "status" => "active"]);
        break;
}
?>