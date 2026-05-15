// ══════════════════════════════════════════
// NexFinance — app.js  (connected to api.php)
// ══════════════════════════════════════════

const API = 'api.php';

// ── State ──────────────────────────────────
let SESSION = null;
let allTransactions = [];
let allDocuments    = [];
let allCategories   = [];
let allUsers        = [];
let donutChart      = null;
let cashflowChart   = null;

// ── API helper ─────────────────────────────
async function api(action, method='GET', body=null, id=null){
  let url = `${API}?action=${action}`;
  if(id) url += `&id=${id}`;
  const opts = { method, headers:{'Content-Type':'application/json'} };
  if(body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  return res.json();
}

// ── Toast ───────────────────────────────────
function toast(msg, icon='✅'){
  const t = document.getElementById('toast');
  t.innerHTML = `<span>${icon}</span> ${msg}`;
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(()=>t.classList.remove('show'), 3000);
}

// ── Format ─────────────────────────────────
function rp(n){ return 'Rp ' + Number(n||0).toLocaleString('id-ID'); }
function rpK(n){
  n = Number(n||0);
  if(n>=1e9) return 'Rp '+(n/1e9).toFixed(1)+' M';
  if(n>=1e6) return 'Rp '+(n/1e6).toFixed(1)+' Jt';
  if(n>=1e3) return 'Rp '+(n/1e3).toFixed(0)+' Rb';
  return rp(n);
}
function fmtDate(d){ if(!d) return '-'; return new Date(d).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}); }

// ── Status badge ───────────────────────────
function statusBadge(s){
  const map = {paid:'b-success',pending:'b-warning',overdue:'b-danger',partial:'b-info',cancelled:'b-gray'};
  const lbl = {paid:'Lunas',pending:'Pending',overdue:'Overdue',partial:'Sebagian',cancelled:'Batal'};
  return `<span class="badge ${map[s]||'b-gray'}">${lbl[s]||s}</span>`;
}
function typeBadge(t){
  if(t==='income') return `<span class="badge b-success">Pemasukan</span>`;
  if(t==='expense') return `<span class="badge b-danger">Pengeluaran</span>`;
  const docMap = {invoice:'b-info',receipt:'b-success',quotation:'b-purple'};
  const docLbl = {invoice:'Invoice',receipt:'Kuitansi',quotation:'Penawaran'};
  return `<span class="badge ${docMap[t]||'b-gray'}">${docLbl[t]||t}</span>`;
}

// ══════════════════════════════════════════
// LOGIN / LOGOUT
// ══════════════════════════════════════════
async function doLogin(){
  const u = document.getElementById('l-user').value.trim();
  const p = document.getElementById('l-pass').value;
  if(!u||!p){ showLoginErr('Isi username dan password'); return; }
  const btn = document.getElementById('btn-login');
  btn.disabled = true; btn.textContent = 'Masuk...';
  try {
    const res = await api('login','POST',{username:u, password:p});
    if(res.success){
      SESSION = res.user;
      sessionStorage.setItem('nf_session', JSON.stringify(SESSION));
      startApp();
    } else {
      showLoginErr(res.message || 'Login gagal');
    }
  } catch(e){ showLoginErr('Tidak dapat terhubung ke server'); }
  btn.disabled = false; btn.textContent = 'Masuk';
}
function showLoginErr(msg){ const el=document.getElementById('login-err'); el.textContent=msg; el.classList.add('show'); }
function hideLoginErr(){ document.getElementById('login-err').classList.remove('show'); }

function doLogout(){
  SESSION = null;
  sessionStorage.removeItem('nf_session');
  document.getElementById('app').className = '';
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('l-user').value = '';
  document.getElementById('l-pass').value = '';
  hideLoginErr();
}

function startApp(){
  document.getElementById('login-screen').style.display = 'none';
  const app = document.getElementById('app');
  app.style.display = 'flex';
  app.classList.add('show');
  // update sidebar user info
  document.getElementById('sb-av').textContent   = (SESSION.avatar||SESSION.name||'A').charAt(0).toUpperCase();
  document.getElementById('sb-name').textContent = SESSION.name || SESSION.username;
  document.getElementById('sb-role').textContent = SESSION.role || 'Staff';
  // load initial data
  loadAll();
}

// ══════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════
const pageMeta = {
  dashboard:    {title:'Dashboard',       sub:'Overview keuangan perusahaan'},
  income:       {title:'Invoice & Tagihan',sub:'Kelola dokumen keuangan'},
  expense:      {title:'Pengeluaran',      sub:'Manajemen transaksi keluar'},
  transactions: {title:'Semua Transaksi',  sub:'Riwayat transaksi lengkap'},
  settings:     {title:'Pengaturan',       sub:'Konfigurasi sistem'},
};

function nav(page){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('page-'+page).classList.add('active');
  const ni = document.querySelector(`.nav-item[onclick="nav('${page}')"]`);
  if(ni) ni.classList.add('active');
  document.getElementById('page-title').textContent = pageMeta[page]?.title || page;
  document.getElementById('page-sub').textContent   = pageMeta[page]?.sub || '';
  // Lazy render
  if(page==='income')       renderDocTable();
  if(page==='expense')      renderExpTable();
  if(page==='transactions') renderTxnTable();
  if(page==='settings')     loadSettings();
}

function topbarAdd(){
  const page = document.querySelector('.page.active')?.id?.replace('page-','');
  if(page==='income')   { openModal('modal-doc'); }
  else if(page==='expense')  { openModal('modal-txn'); setTxnType('expense'); }
  else if(page==='transactions') openModal('modal-txn');
  else openModal('modal-txn');
}

// ══════════════════════════════════════════
// MODAL
// ══════════════════════════════════════════
function openModal(id){ document.getElementById(id).classList.add('open'); }
function closeModal(id){ document.getElementById(id).classList.remove('open'); }
document.querySelectorAll('.modal-overlay').forEach(m=>{
  m.addEventListener('click',e=>{ if(e.target===m) m.classList.remove('open'); });
});

// ══════════════════════════════════════════
// LOAD ALL DATA
// ══════════════════════════════════════════
async function loadAll(){
  await Promise.all([loadTransactions(), loadDocuments(), loadCategories()]);
  renderDashboard();
}

async function loadTransactions(){
  allTransactions = await api('get_transactions');
  populateCatFilters();
}

async function loadDocuments(){
  allDocuments = await api('get_documents');
}

async function loadCategories(){
  allCategories = await api('get_categories');
  populateCatSelects();
  populateCatFilters();
}

function populateCatSelects(){
  const opts = allCategories.map(c=>`<option value="${c}">${c}</option>`).join('');
  document.getElementById('txn-category').innerHTML = '<option value="">— Pilih Kategori —</option>' + opts;
}

function populateCatFilters(){
  const cats = [...new Set(allTransactions.map(t=>t.category).filter(Boolean))];
  const opts = cats.map(c=>`<option value="${c}">${c}</option>`).join('');
  ['exp-filter-cat','txn-filter-cat'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.innerHTML = '<option value="">Semua Kategori</option>' + opts;
  });
}

// ══════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════
async function renderDashboard(){
  // Summary from API
  const sum = await api('get_summary');
  const bal = sum.balance||0;
  document.getElementById('db-balance').textContent = rpK(bal);
  document.getElementById('db-income').textContent  = rpK(sum.income||0);
  document.getElementById('db-expense').textContent = rpK(sum.expense||0);
  document.getElementById('db-bal-lbl').textContent = bal>=0 ? 'Positif' : 'Defisit';
  document.getElementById('db-bal-lbl').className   = `sc-badge ${bal>=0?'up':'down'}`;

  // Pending docs
  const pending = allDocuments.filter(d=>d.status==='pending'||d.status==='overdue').length;
  document.getElementById('db-docs').textContent   = pending + ' dokumen';
  document.getElementById('db-doc-lbl').textContent = 'Perlu Aksi';

  // Recent transactions (last 10)
  const recent = allTransactions.slice(0,10);
  const tbody = document.getElementById('db-txn-tbody');
  if(!recent.length){ tbody.innerHTML='<tr class="loading-row"><td colspan="5">Belum ada transaksi</td></tr>'; }
  else { tbody.innerHTML = recent.map(t=>`
    <tr>
      <td class="fw-6 c-dark">${t.title}</td>
      <td><span class="badge b-purple">${t.category||'-'}</span></td>
      <td class="fs-11 c-muted">${fmtDate(t.transaction_date)}</td>
      <td class="fw-7 ${t.type==='income'?'c-success':'c-danger'}">${t.type==='income'?'+':'-'}${rp(t.amount)}</td>
      <td>${typeBadge(t.type)}</td>
    </tr>`).join(''); }

  // Donut: expense by category
  const expOnly = allTransactions.filter(t=>t.type==='expense');
  const catMap  = {};
  expOnly.forEach(t=>{ catMap[t.category||'Lain-lain'] = (catMap[t.category||'Lain-lain']||0)+Number(t.amount); });
  const cats   = Object.keys(catMap).slice(0,6);
  const vals   = cats.map(c=>catMap[c]);
  const colors = ['#6c63ff','#00c48c','#ffb547','#ff647c','#3d9ef8','#ec4899'];
  const totalExp = vals.reduce((a,b)=>a+b,0);
  document.getElementById('db-donut-val').textContent = rpK(totalExp);
  const lgd = document.getElementById('db-donut-legend');
  lgd.innerHTML = cats.map((c,i)=>`<li><span class="leg-dot" style="background:${colors[i%colors.length]}"></span><span class="leg-lbl">${c}</span><span class="leg-val">${rpK(vals[i])}</span></li>`).join('');
  if(donutChart) donutChart.destroy();
  const ctx = document.getElementById('db-donut');
  if(ctx && vals.length){
    donutChart = new Chart(ctx,{
      type:'doughnut',
      data:{labels:cats,datasets:[{data:vals,backgroundColor:colors,borderWidth:0,hoverOffset:6}]},
      options:{responsive:true,cutout:'70%',plugins:{legend:{display:false}}}
    });
  }

  // Recent docs
  const docTbody = document.getElementById('db-doc-tbody');
  const recentDocs = allDocuments.slice(0,6);
  if(!recentDocs.length){ docTbody.innerHTML='<tr class="loading-row"><td colspan="4">Belum ada dokumen</td></tr>'; }
  else { docTbody.innerHTML = recentDocs.map(d=>`
    <tr>
      <td class="fw-6 c-dark">${d.title}</td>
      <td class="c-muted fs-11">${d.entity}</td>
      <td class="fw-7">${rp(d.amount)}</td>
      <td>${statusBadge(d.status)}</td>
    </tr>`).join(''); }

  // Cashflow chart (group by month from transactions)
  buildCashflowChart();
}

function buildCashflowChart(){
  // Group last 6 months
  const months = [];
  const now = new Date();
  for(let i=5;i>=0;i--){
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    months.push({ key: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`, label: d.toLocaleDateString('id-ID',{month:'short',year:'2-digit'}) });
  }
  const incData  = months.map(m=> allTransactions.filter(t=>t.type==='income'  && (t.transaction_date||'').startsWith(m.key)).reduce((s,t)=>s+Number(t.amount),0)/1e6);
  const expData  = months.map(m=> allTransactions.filter(t=>t.type==='expense' && (t.transaction_date||'').startsWith(m.key)).reduce((s,t)=>s+Number(t.amount),0)/1e6);
  if(cashflowChart) cashflowChart.destroy();
  const ctx = document.getElementById('db-cashflow');
  if(!ctx) return;
  cashflowChart = new Chart(ctx,{
    type:'bar',
    data:{
      labels: months.map(m=>m.label),
      datasets:[
        {label:'Pemasukan',data:incData,backgroundColor:'rgba(0,196,140,.7)',borderRadius:5,borderSkipped:false},
        {label:'Pengeluaran',data:expData,backgroundColor:'rgba(255,100,124,.65)',borderRadius:5,borderSkipped:false},
      ]
    },
    options:{responsive:true,plugins:{legend:{position:'bottom',labels:{font:{size:11}}}},scales:{y:{grid:{color:'#f0f1f7'},title:{display:true,text:'Juta Rp',font:{size:10}}},x:{grid:{display:false}}}}
  });
}


// ══════════════════════════════════════════
// INVOICE & DOKUMEN
// ══════════════════════════════════════════
function renderDocTable(){
  const q   = (document.getElementById('inv-search')?.value||'').toLowerCase();
  const typ = document.getElementById('inv-filter-type')?.value||'';
  const sts = document.getElementById('inv-filter-status')?.value||'';

  let docs = allDocuments.filter(d=>{
    if(typ && d.type!==typ) return false;
    if(sts && d.status!==sts) return false;
    if(q && !d.title.toLowerCase().includes(q) && !d.entity.toLowerCase().includes(q)) return false;
    return true;
  });

  // Stats
  const paid    = allDocuments.filter(d=>d.status==='paid');
  const pending = allDocuments.filter(d=>d.status==='pending');
  const overdue = allDocuments.filter(d=>d.status==='overdue');
  document.getElementById('inv-paid-ct').textContent  = paid.length+' dok';
  document.getElementById('inv-paid-val').textContent = rpK(paid.reduce((s,d)=>s+d.amount,0));
  document.getElementById('inv-pend-ct').textContent  = pending.length+' dok';
  document.getElementById('inv-pend-val').textContent = rpK(pending.reduce((s,d)=>s+d.amount,0));
  document.getElementById('inv-over-ct').textContent  = overdue.length+' dok';
  document.getElementById('inv-over-val').textContent = rpK(overdue.reduce((s,d)=>s+d.amount,0));
  document.getElementById('inv-tot-ct').textContent   = allDocuments.length+' dok';
  document.getElementById('inv-tot-val').textContent  = rpK(allDocuments.reduce((s,d)=>s+d.amount,0));

  const tbody = document.getElementById('doc-tbody');
  if(!docs.length){ tbody.innerHTML='<tr class="loading-row"><td colspan="8">Tidak ada data</td></tr>'; return; }
  tbody.innerHTML = docs.map(d=>`
    <tr>
      <td class="fw-6 c-dark">${d.title}</td>
      <td class="c-muted fs-11">${d.entity}</td>
      <td>${typeBadge(d.type)}</td>
      <td class="fs-11 c-muted">${fmtDate(d.dueDate)}</td>
      <td class="fw-7">${rp(d.amount)}</td>
      <td class="${d.paidAmount>0?'c-success':''}">${rp(d.paidAmount)}</td>
      <td>${statusBadge(d.status)}</td>
      <td><div class="act-btns">
        <button class="btn btn-outline btn-sm" title="Lihat Invoice" onclick="viewInvoice(${d.id})">👁</button>
        <button class="btn btn-outline btn-sm" title="Catat Pembayaran" onclick="openPayModal(${d.id})">💳</button>
        <button class="btn btn-outline btn-sm" title="Edit" onclick="editDoc(${d.id})">✏️</button>
        <button class="btn btn-sm btn-danger" title="Hapus" onclick="confirmDelete('doc',${d.id},'${d.title.replace(/'/g,"\\'")}')">🗑</button>
      </div></td>
    </tr>`).join('');
}

function openDocModal(id=null){
  document.getElementById('doc-id').value   = id||'';
  document.getElementById('modal-doc-title').textContent = id ? 'Edit Dokumen' : 'Buat Dokumen Baru';
  if(!id){
    ['doc-title','doc-entity','doc-notes'].forEach(x=>document.getElementById(x).value='');
    ['doc-subtotal','doc-discount','doc-tax-pct','doc-amount'].forEach(x=>document.getElementById(x).value=0);
    document.getElementById('doc-type').value = 'invoice';
    document.getElementById('doc-due').value  = new Date().toISOString().split('T')[0];
  }
  openModal('modal-doc');
}

function editDoc(id){
  const d = allDocuments.find(x=>x.id===id);
  if(!d) return;
  document.getElementById('doc-id').value       = d.id;
  document.getElementById('modal-doc-title').textContent = 'Edit Dokumen';
  document.getElementById('doc-title').value    = d.title;
  document.getElementById('doc-entity').value   = d.entity;
  document.getElementById('doc-type').value     = d.type;
  document.getElementById('doc-due').value      = d.dueDate||'';
  document.getElementById('doc-subtotal').value = d.subtotal||d.amount||0;
  document.getElementById('doc-discount').value = d.discountAmt||0;
  document.getElementById('doc-tax-pct').value  = d.taxPercent||0;
  document.getElementById('doc-amount').value   = d.amount||0;
  document.getElementById('doc-notes').value    = d.notes||'';
  openModal('modal-doc');
}

function calcDocTotal(){
  const sub  = parseFloat(document.getElementById('doc-subtotal').value)||0;
  const disc = parseFloat(document.getElementById('doc-discount').value)||0;
  const taxP = parseFloat(document.getElementById('doc-tax-pct').value)||0;
  const tax  = (sub - disc) * taxP / 100;
  document.getElementById('doc-amount').value = Math.round(sub - disc + tax);
}

async function saveDoc(){
  const id  = document.getElementById('doc-id').value;
  const sub = parseFloat(document.getElementById('doc-subtotal').value)||0;
  calcDocTotal();
  const body = {
    title:      document.getElementById('doc-title').value.trim(),
    entity:     document.getElementById('doc-entity').value.trim(),
    type:       document.getElementById('doc-type').value,
    dueDate:    document.getElementById('doc-due').value,
    amount:     parseFloat(document.getElementById('doc-amount').value)||0,
    subtotal:   sub,
    discountAmt:parseFloat(document.getElementById('doc-discount').value)||0,
    taxPercent: parseFloat(document.getElementById('doc-tax-pct').value)||0,
    taxAmt:     (sub-(parseFloat(document.getElementById('doc-discount').value)||0))*(parseFloat(document.getElementById('doc-tax-pct').value)||0)/100,
    notes:      document.getElementById('doc-notes').value,
  };
  if(!body.title||!body.entity){ toast('Judul dan entitas wajib diisi','⚠️'); return; }

  if(id){
    // For update we just update status/paid via update_document_payment — or add a full update if needed
    // We'll reload and patch with add for simplicity (API doesn't have full update_document, only status/payment)
    // Use add as upsert workaround: delete + add
    await api('delete_document','DELETE',null,id);
    await api('add_document','POST',body);
  } else {
    await api('add_document','POST',body);
  }
  closeModal('modal-doc');
  toast(id ? 'Dokumen diperbarui!' : 'Dokumen disimpan!');
  await loadDocuments();
  renderDocTable();
  if(document.getElementById('page-dashboard').classList.contains('active')) renderDashboard();
}

function openPayModal(id){
  const d = allDocuments.find(x=>x.id===id);
  if(!d) return;
  document.getElementById('pay-doc-id').value    = d.id;
  document.getElementById('pay-doc-title').value = d.title;
  document.getElementById('pay-total').value     = d.amount;
  document.getElementById('pay-amount').value    = d.paidAmount||0;
  document.getElementById('pay-status').value    = d.status==='paid'?'paid':'partial';
  openModal('modal-pay');
}

// ══════════════════════════════════════════
// VIEW INVOICE MODAL
// ══════════════════════════════════════════
async function viewInvoice(id){
  const d = allDocuments.find(x=>x.id===id);
  if(!d) return;

  // Load company profile for header
  let cp = null;
  try { cp = await api('get_company_profile'); } catch(e){}

  // ── Header band ──
  const typeLabel = {invoice:'Invoice',receipt:'Kuitansi',quotation:'Penawaran Harga'};
  document.getElementById('inv-view-number').textContent = d.title;
  document.getElementById('inv-view-type').textContent   = typeLabel[d.type]||d.type;

  // Company info
  const companyName = cp?.name || 'NexFinance';
  const logoEl = document.getElementById('inv-view-logo');
  if(cp?.logo){ logoEl.innerHTML=`<img src="${cp.logo}" style="width:100%;height:100%;object-fit:contain;border-radius:14px;">`; }
  else { logoEl.textContent = companyName.charAt(0).toUpperCase(); }
  document.getElementById('inv-view-company').textContent     = companyName;
  document.getElementById('inv-view-company-addr').textContent= cp?.address ? cp.address.split('\n')[0] : (cp?.email||'');

  // Dates
  document.getElementById('inv-view-created').textContent = fmtDate(new Date().toISOString().split('T')[0]);
  document.getElementById('inv-view-due').textContent     = fmtDate(d.dueDate)||'—';

  // Status in band
  const statusColors = {paid:'#00c48c',pending:'#ffb547',overdue:'#ff647c',partial:'#3d9ef8'};
  const statusLabels = {paid:'✅ Lunas',pending:'⏳ Pending',overdue:'🚨 Overdue',partial:'🔵 Sebagian'};
  document.getElementById('inv-view-status-band').innerHTML =
    `<span style="color:${statusColors[d.status]||'#8a94a6'};font-weight:700;">${statusLabels[d.status]||d.status}</span>`;

  // ── Parties ──
  document.getElementById('inv-view-from-name').textContent = companyName;
  document.getElementById('inv-view-from-sub').textContent  = cp ? [cp.email, cp.address?.split('\n')[0]].filter(Boolean).join(' · ') : '';
  document.getElementById('inv-view-to-name').textContent   = d.entity;
  document.getElementById('inv-view-to-sub').textContent    = '';

  // ── Items table ──
  const items = d.items && d.items.length ? d.items : [{ desc: d.title||'Layanan/Produk', qty:1, price: d.subtotal||d.amount }];
  document.getElementById('inv-view-items').innerHTML = items.map((item,i)=>`
    <tr>
      <td class="c-muted">${i+1}</td>
      <td>${item.desc||item.name||item.description||'—'}</td>
      <td style="text-align:right;font-weight:600;">${rp(item.price||item.amount||(item.qty*item.unitPrice)||0)}</td>
    </tr>`).join('');

  // ── Totals ──
  const sub     = Number(d.subtotal)||Number(d.amount)||0;
  const disc    = Number(d.discountAmt)||0;
  const taxPct  = Number(d.taxPercent)||0;
  const taxAmt  = Number(d.taxAmt)||(sub-disc)*taxPct/100||0;
  const total   = Number(d.amount)||0;
  const paid    = Number(d.paidAmount)||0;
  const remain  = total - paid;

  document.getElementById('inv-view-subtotal').textContent = rp(sub);

  const discRow = document.getElementById('inv-view-disc-row');
  if(disc>0){ discRow.style.display='flex'; document.getElementById('inv-view-discount').textContent = '− '+rp(disc); }
  else discRow.style.display='none';

  const taxRow = document.getElementById('inv-view-tax-row');
  if(taxPct>0||taxAmt>0){
    taxRow.style.display='flex';
    document.getElementById('inv-view-tax-pct').textContent = taxPct;
    document.getElementById('inv-view-tax-amt').textContent = rp(taxAmt);
  } else taxRow.style.display='none';

  document.getElementById('inv-view-total').textContent = rp(total);

  const paidRow  = document.getElementById('inv-view-paid-row');
  const remRow   = document.getElementById('inv-view-remaining-row');
  if(paid>0){
    paidRow.style.display='flex'; document.getElementById('inv-view-paid').textContent = rp(paid);
    if(remain>0){ remRow.style.display='flex'; document.getElementById('inv-view-remaining').textContent = rp(remain); }
    else remRow.style.display='none';
  } else { paidRow.style.display='none'; remRow.style.display='none'; }

  // ── Payment status box ──
  const psBox   = document.getElementById('inv-view-pay-status');
  const psIcon  = document.getElementById('inv-view-pay-icon');
  const psTitle = document.getElementById('inv-view-pay-title');
  const psSub   = document.getElementById('inv-view-pay-sub');
  psBox.className = 'inv-payment-status ' + (d.status||'pending');
  const statusInfo = {
    paid:    {icon:'✅',title:'Lunas',sub:`Dibayar penuh ${rp(paid)}`},
    pending: {icon:'⏳',title:'Menunggu Pembayaran',sub:`Jatuh tempo: ${fmtDate(d.dueDate)}`},
    overdue: {icon:'🚨',title:'Overdue – Telah Jatuh Tempo',sub:`Jatuh tempo sudah lewat. Segera hubungi klien.`},
    partial: {icon:'🔵',title:'Pembayaran Sebagian',sub:`Terbayar ${rp(paid)} dari ${rp(total)}. Sisa ${rp(remain)}.`},
  };
  const si = statusInfo[d.status]||statusInfo.pending;
  psIcon.textContent = si.icon; psTitle.textContent = si.title; psSub.textContent = si.sub;

  // ── Notes ──
  const notesWrap = document.getElementById('inv-view-notes-wrap');
  if(d.notes){ notesWrap.style.display='block'; document.getElementById('inv-view-notes').textContent = d.notes; }
  else notesWrap.style.display='none';

  // ── Bank info ──
  const bankWrap = document.getElementById('inv-view-bank-wrap');
  if(cp?.bankName){
    bankWrap.style.display='flex';
    document.getElementById('inv-view-bank-name').textContent   = cp.bankName;
    document.getElementById('inv-view-bank-acc').textContent    = cp.bankAccount||'—';
    document.getElementById('inv-view-bank-holder').textContent = 'a.n. '+(cp.bankAccountName||companyName);
  } else bankWrap.style.display='none';

  openModal('modal-invoice-view');
}

async function savePay(){
  const id     = document.getElementById('pay-doc-id').value;
  const paid   = parseFloat(document.getElementById('pay-amount').value)||0;
  const status = document.getElementById('pay-status').value;
  await api('update_document_payment','PUT',{paidAmount:paid, status},id);
  closeModal('modal-pay');
  toast('Pembayaran dicatat!');
  await loadDocuments();
  renderDocTable();
  if(document.getElementById('page-dashboard').classList.contains('active')) renderDashboard();
}

// ══════════════════════════════════════════
// PENGELUARAN
// ══════════════════════════════════════════
function renderExpTable(){
  const q   = (document.getElementById('exp-search')?.value||'').toLowerCase();
  const cat = document.getElementById('exp-filter-cat')?.value||'';
  const exp = allTransactions.filter(t=>{
    if(t.type!=='expense') return false;
    if(cat && t.category!==cat) return false;
    if(q && !t.title.toLowerCase().includes(q)) return false;
    return true;
  });

  // Stats
  const total = exp.reduce((s,t)=>s+Number(t.amount),0);
  const now   = new Date();
  const thisM = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const monthExp = exp.filter(t=>(t.transaction_date||'').startsWith(thisM)).reduce((s,t)=>s+Number(t.amount),0);
  // Biggest category
  const catMap = {};
  exp.forEach(t=>{ catMap[t.category||'Lain-lain']=(catMap[t.category||'Lain-lain']||0)+Number(t.amount); });
  const bigCat = Object.entries(catMap).sort((a,b)=>b[1]-a[1])[0];
  document.getElementById('exp-tot-ct').textContent   = exp.length+' txn';
  document.getElementById('exp-tot-val').textContent  = rpK(total);
  document.getElementById('exp-cat-ct').textContent   = bigCat ? bigCat[0] : '-';
  document.getElementById('exp-cat-val').textContent  = bigCat ? rpK(bigCat[1]) : '-';
  document.getElementById('exp-month-val').textContent= rpK(monthExp);
  document.getElementById('exp-count-ct').textContent = exp.length+' total';
  document.getElementById('exp-count-val').textContent= exp.length+' transaksi';

  const tbody = document.getElementById('exp-tbody');
  if(!exp.length){ tbody.innerHTML='<tr class="loading-row"><td colspan="5">Tidak ada pengeluaran</td></tr>'; return; }
  tbody.innerHTML = exp.map(t=>`
    <tr>
      <td class="fw-6 c-dark">${t.title}</td>
      <td><span class="badge b-purple">${t.category||'-'}</span></td>
      <td class="fs-11 c-muted">${fmtDate(t.transaction_date)}</td>
      <td class="fw-7 c-danger">${rp(t.amount)}</td>
      <td><div class="act-btns">
        <button class="btn btn-outline btn-sm" onclick="editTxn(${t.id})">✏️</button>
        <button class="btn btn-sm btn-danger" onclick="confirmDelete('txn',${t.id},'${t.title.replace(/'/g,"\\'")}')">🗑</button>
      </div></td>
    </tr>`).join('');
}

// ══════════════════════════════════════════
// TRANSAKSI (CRUD)
// ══════════════════════════════════════════
function renderTxnTable(){
  const q   = (document.getElementById('txn-search')?.value||'').toLowerCase();
  const typ = document.getElementById('txn-filter-type')?.value||'';
  const cat = document.getElementById('txn-filter-cat')?.value||'';
  const txns = allTransactions.filter(t=>{
    if(typ && t.type!==typ) return false;
    if(cat && t.category!==cat) return false;
    if(q && !t.title.toLowerCase().includes(q)) return false;
    return true;
  });
  const tbody = document.getElementById('txn-tbody');
  if(!txns.length){ tbody.innerHTML='<tr class="loading-row"><td colspan="6">Tidak ada data</td></tr>'; return; }
  tbody.innerHTML = txns.map(t=>`
    <tr>
      <td class="fw-6 c-dark">${t.title}</td>
      <td><span class="badge b-purple">${t.category||'-'}</span></td>
      <td class="fs-11 c-muted">${fmtDate(t.transaction_date)}</td>
      <td>${typeBadge(t.type)}</td>
      <td class="fw-7 ${t.type==='income'?'c-success':'c-danger'}">${t.type==='income'?'+':'-'}${rp(t.amount)}</td>
      <td><div class="act-btns">
        <button class="btn btn-outline btn-sm" onclick="editTxn(${t.id})">✏️</button>
        <button class="btn btn-sm btn-danger" onclick="confirmDelete('txn',${t.id},'${t.title.replace(/'/g,"\\'")}')">🗑</button>
      </div></td>
    </tr>`).join('');
}

function setTxnType(type){ document.getElementById('txn-type').value = type; }

function openTxnModal(id=null){
  document.getElementById('txn-id').value = id||'';
  document.getElementById('modal-txn-title').textContent = id ? 'Edit Transaksi' : 'Tambah Transaksi';
  if(!id){
    document.getElementById('txn-title').value    = '';
    document.getElementById('txn-type').value     = 'expense';
    document.getElementById('txn-category').value = '';
    document.getElementById('txn-amount').value   = '';
    document.getElementById('txn-date').value     = new Date().toISOString().split('T')[0];
  }
  openModal('modal-txn');
}

function editTxn(id){
  const t = allTransactions.find(x=>x.id==id);
  if(!t) return;
  document.getElementById('txn-id').value           = t.id;
  document.getElementById('modal-txn-title').textContent = 'Edit Transaksi';
  document.getElementById('txn-title').value        = t.title;
  document.getElementById('txn-type').value         = t.type;
  document.getElementById('txn-category').value     = t.category||'';
  document.getElementById('txn-amount').value       = t.amount;
  document.getElementById('txn-date').value         = t.transaction_date||'';
  openModal('modal-txn');
}

async function saveTxn(){
  const id  = document.getElementById('txn-id').value;
  const body = {
    title:    document.getElementById('txn-title').value.trim(),
    type:     document.getElementById('txn-type').value,
    category: document.getElementById('txn-category').value,
    amount:   parseFloat(document.getElementById('txn-amount').value)||0,
    date:     document.getElementById('txn-date').value,
  };
  if(!body.title || !body.amount){ toast('Judul dan jumlah wajib diisi','⚠️'); return; }
  if(id){
    await api('update_transaction','PUT',body,id);
    toast('Transaksi diperbarui!');
  } else {
    await api('add_transaction','POST',body);
    toast('Transaksi disimpan!');
  }
  closeModal('modal-txn');
  await loadTransactions();
  renderTxnTable();
  renderExpTable();
  if(document.getElementById('page-dashboard').classList.contains('active')) renderDashboard();
}

// ══════════════════════════════════════════
// CONFIRM DELETE
// ══════════════════════════════════════════
function confirmDelete(type, id, name){
  document.getElementById('confirm-msg').textContent = `Hapus "${name}"? Tindakan ini tidak dapat dibatalkan.`;
  const btn = document.getElementById('confirm-ok-btn');
  btn.onclick = async ()=>{
    if(type==='txn'){
      await api('delete_transaction','DELETE',null,id);
      await loadTransactions();
      renderTxnTable(); renderExpTable();
    } else {
      await api('delete_document','DELETE',null,id);
      await loadDocuments();
      renderDocTable();
    }
    if(document.getElementById('page-dashboard').classList.contains('active')) renderDashboard();
    closeModal('modal-confirm');
    toast('Data dihapus','🗑️');
  };
  openModal('modal-confirm');
}

// ══════════════════════════════════════════
// SETTINGS
// ══════════════════════════════════════════
async function loadSettings(){
  await Promise.all([loadCompanyProfile(), loadUsers(), renderCategories()]);
}

// Company Profile
async function loadCompanyProfile(){
  const cp = await api('get_company_profile');
  if(!cp) return;
  document.getElementById('cp-name').value        = cp.name||'';
  document.getElementById('cp-email').value       = cp.email||'';
  document.getElementById('cp-address').value     = cp.address||'';
  document.getElementById('cp-bank-name').value   = cp.bankName||'';
  document.getElementById('cp-bank-acc').value    = cp.bankAccount||'';
  document.getElementById('cp-bank-holder').value = cp.bankAccountName||'';
  if(cp.logo){
    const img = document.getElementById('cp-logo-preview');
    img.src = cp.logo; img.style.display='block';
  }
}

let cpLogoBase64 = null;
function previewLogo(input){
  const file = input.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = e=>{
    cpLogoBase64 = e.target.result;
    const img = document.getElementById('cp-logo-preview');
    img.src = cpLogoBase64; img.style.display='block';
  };
  reader.readAsDataURL(file);
}

async function saveCompanyProfile(){
  const body = {
    name:            document.getElementById('cp-name').value.trim(),
    email:           document.getElementById('cp-email').value.trim(),
    address:         document.getElementById('cp-address').value.trim(),
    bankName:        document.getElementById('cp-bank-name').value.trim(),
    bankAccount:     document.getElementById('cp-bank-acc').value.trim(),
    bankAccountName: document.getElementById('cp-bank-holder').value.trim(),
    logo:            cpLogoBase64 || document.getElementById('cp-logo-preview').src || null,
  };
  if(!body.name){ toast('Nama perusahaan wajib diisi','⚠️'); return; }
  await api('update_company_profile','PUT',body);
  toast('Profil perusahaan disimpan!');
}

// Users
async function loadUsers(){
  allUsers = await api('get_users');
  renderUsersTable();
}

function renderUsersTable(){
  const tbody = document.getElementById('users-tbody');
  if(!allUsers.length){ tbody.innerHTML='<tr class="loading-row"><td colspan="5">Belum ada user</td></tr>'; return; }
  tbody.innerHTML = allUsers.map(u=>`
    <tr>
      <td class="fw-6 c-dark">${u.username}</td>
      <td>${u.name}</td>
      <td class="c-muted fs-11">${u.phone||'-'}</td>
      <td><span class="badge ${u.role==='admin'?'b-danger':u.role==='manager'?'b-info':'b-gray'}">${u.role}</span></td>
      <td><div class="act-btns">
        <button class="btn btn-outline btn-sm" onclick="editUser(${u.id})">✏️</button>
        ${u.username!=='admin'?`<button class="btn btn-sm btn-danger" onclick="confirmDeleteUser(${u.id},'${u.name}')">🗑</button>`:''}
      </div></td>
    </tr>`).join('');
}

function openUserModal(id=null){
  document.getElementById('user-id').value = id||'';
  document.getElementById('modal-user-title').textContent = id ? 'Edit User' : 'Tambah User';
  if(!id){
    ['user-username','user-password','user-name','user-phone'].forEach(x=>document.getElementById(x).value='');
    document.getElementById('user-role').value = 'staff';
  }
  openModal('modal-user');
}

function editUser(id){
  const u = allUsers.find(x=>x.id===id);
  if(!u) return;
  document.getElementById('user-id').value       = u.id;
  document.getElementById('modal-user-title').textContent = 'Edit User';
  document.getElementById('user-username').value = u.username;
  document.getElementById('user-password').value = u.password||'';
  document.getElementById('user-name').value     = u.name;
  document.getElementById('user-phone').value    = u.phone||'';
  document.getElementById('user-role').value     = u.role||'staff';
  openModal('modal-user');
}

async function saveUser(){
  const id = document.getElementById('user-id').value;
  const body = {
    username: document.getElementById('user-username').value.trim(),
    password: document.getElementById('user-password').value,
    name:     document.getElementById('user-name').value.trim(),
    phone:    document.getElementById('user-phone').value.trim(),
    role:     document.getElementById('user-role').value,
    avatar:   document.getElementById('user-name').value.trim().split(' ')[0],
  };
  if(!body.name||!body.password){ toast('Nama dan password wajib diisi','⚠️'); return; }
  if(id){
    await api('update_user','PUT',body,id);
    toast('User diperbarui!');
  } else {
    if(!body.username){ toast('Username wajib diisi','⚠️'); return; }
    await api('add_user','POST',body);
    toast('User ditambahkan!');
  }
  closeModal('modal-user');
  await loadUsers();
}

function confirmDeleteUser(id, name){
  document.getElementById('confirm-msg').textContent = `Hapus user "${name}"?`;
  const btn = document.getElementById('confirm-ok-btn');
  btn.onclick = async ()=>{
    await api('delete_user','DELETE',null,id);
    await loadUsers();
    closeModal('modal-confirm');
    toast('User dihapus','🗑️');
  };
  openModal('modal-confirm');
}

// Categories
async function renderCategories(){
  const list = document.getElementById('cat-list');
  if(!allCategories.length){ list.innerHTML='<span class="c-muted fs-12">Belum ada kategori</span>'; return; }
  list.innerHTML = allCategories.map(c=>`
    <div style="display:flex;align-items:center;gap:5px;background:var(--primary-light);padding:5px 10px;border-radius:20px;">
      <span style="font-size:12px;font-weight:600;color:var(--primary)">${c}</span>
      <button style="background:none;border:none;cursor:pointer;color:var(--danger);font-size:13px;line-height:1;" onclick="deleteCategory('${c}')">×</button>
    </div>`).join('');
}

async function addCategory(){
  const name = document.getElementById('new-cat').value.trim();
  if(!name){ toast('Nama kategori wajib diisi','⚠️'); return; }
  await api('add_category','POST',{name});
  document.getElementById('new-cat').value = '';
  await loadCategories();
  renderCategories();
  toast('Kategori ditambahkan!');
}

async function deleteCategory(name){
  await api('delete_category','DELETE',null,null);
  // API uses ?name=X for delete_category
  const url = `${API}?action=delete_category&name=${encodeURIComponent(name)}`;
  await fetch(url,{method:'DELETE'});
  await loadCategories();
  renderCategories();
  toast('Kategori dihapus','🗑️');
}

// Settings tabs
function showStab(tab){
  ['company','users','categories'].forEach(t=>{
    document.getElementById('stab-'+t).style.display = t===tab ? '' : 'none';
  });
  document.querySelectorAll('.stab').forEach((b,i)=>{
    b.classList.toggle('active', ['company','users','categories'][i]===tab);
  });
  if(tab==='users') loadUsers();
  if(tab==='categories') renderCategories();
}

// ══════════════════════════════════════════
// KEYBOARD SHORTCUT
// ══════════════════════════════════════════
document.getElementById('l-pass').addEventListener('keydown', e=>{ if(e.key==='Enter') doLogin(); });
document.getElementById('l-user').addEventListener('keydown', e=>{ if(e.key==='Enter') document.getElementById('l-pass').focus(); });

// ══════════════════════════════════════════
// INIT: check session
// ══════════════════════════════════════════
window.addEventListener('DOMContentLoaded', ()=>{
  const saved = sessionStorage.getItem('nf_session');
  if(saved){
    SESSION = JSON.parse(saved);
    startApp();
  }
  // Set today as default date
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('txn-date').value = today;
  document.getElementById('doc-due').value  = today;
});
