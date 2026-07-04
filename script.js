/* ============================================================
   GHS 124NB — Report Card Register
   Pure vanilla JS + localStorage. No backend, no build step.
   ============================================================ */

const STORAGE_KEY = 'ghs124nb_report_data_v1';

const DEFAULT_CLASSES = ['Kachi (KG)','Class 1','Class 2','Class 3','Class 4','Class 5','Class 6','Class 7','Class 8'];
const DEFAULT_TERMS = ['First Term','Mid Term','Final Term'];
const DEFAULT_GRADE_SCALE = [
  { grade:'A+', from:90, to:100, remarks:'Excellent' },
  { grade:'A',  from:80, to:89,  remarks:'Very Good' },
  { grade:'B',  from:70, to:79,  remarks:'Good' },
  { grade:'C',  from:60, to:69,  remarks:'Satisfactory' },
  { grade:'D',  from:50, to:59,  remarks:'Needs Improvement' },
  { grade:'F',  from:0,  to:49,  remarks:'Fail' },
];

function uid(){ return Math.random().toString(36).slice(2,10) + Date.now().toString(36); }

function defaultData(){
  return {
    meta:{
      schoolName:'Govt. High School 124NB',
      address:'',
      session:'',
      principal:''
    },
    classes: DEFAULT_CLASSES.slice(),
    terms: DEFAULT_TERMS.slice(),
    gradeScale: DEFAULT_GRADE_SCALE.map(g=>({...g})),
    subjects:{},   // { className: [{id,name,max}] }
    students:{},   // { className: [{id,roll,name,father,dob}] }
    marks:{}       // { className: { term: { studentId: { subjectId: number } } } }
  };
}

let DATA = loadData();
let currentClass = DATA.classes[0];

function loadData(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return defaultData();
    const parsed = JSON.parse(raw);
    // shallow-fill any missing top-level keys (forward compatibility)
    const base = defaultData();
    return { ...base, ...parsed, meta:{...base.meta, ...(parsed.meta||{})} };
  }catch(e){
    console.error('Failed to load data, starting fresh.', e);
    return defaultData();
  }
}

function saveData(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(DATA));
}

function ensureClassScaffolding(cls){
  if(!DATA.subjects[cls]) DATA.subjects[cls] = [];
  if(!DATA.students[cls]) DATA.students[cls] = [];
  if(!DATA.marks[cls]) DATA.marks[cls] = {};
  DATA.terms.forEach(t=>{ if(!DATA.marks[cls][t]) DATA.marks[cls][t] = {}; });
  // migrate older subject records that don't have a "min" (pass marks) field yet
  DATA.subjects[cls].forEach(s=>{
    if(s.min==null || isNaN(s.min)) s.min = Math.round(s.max*0.33);
  });
}
DATA.classes.forEach(ensureClassScaffolding);

/* ---------------- helpers ---------------- */
function $(sel, root=document){ return root.querySelector(sel); }
function $all(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }
function el(tag, attrs={}, ...children){
  const e = document.createElement(tag);
  Object.entries(attrs).forEach(([k,v])=>{
    if(k==='class') e.className = v;
    else if(k==='html') e.innerHTML = v;
    else if(k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else e.setAttribute(k,v);
  });
  children.flat().forEach(c=>{
    if(c==null) return;
    e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return e;
}
function toast(msg){
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(()=>t.classList.remove('show'), 2200);
}
function gradeFor(pct){
  const scale = DATA.gradeScale;
  for(const g of scale){ if(pct >= g.from && pct <= g.to) return g; }
  return scale[scale.length-1];
}

/* ---------------- navigation ---------------- */
const VIEWS = ['dashboard','students','subjects','marks','reports','settings'];
function showView(name){
  VIEWS.forEach(v=>{
    $('#view-'+v).classList.toggle('active', v===name);
  });
  $all('.nav-btn').forEach(b=> b.classList.toggle('active', b.dataset.view===name));
  if(window.innerWidth <= 900) $('#sidebar').classList.remove('open');
  render(name);
}
$all('.nav-btn').forEach(b=> b.addEventListener('click', ()=> showView(b.dataset.view)));
$('#menuToggle').addEventListener('click', ()=> $('#sidebar').classList.toggle('open'));

/* ---------------- class selector ---------------- */
function populateClassSelect(){
  const sel = $('#classSelect');
  sel.innerHTML = '';
  DATA.classes.forEach(c=> sel.appendChild(el('option', {value:c}, c)));
  sel.value = currentClass;
}
$('#classSelect').addEventListener('change', e=>{
  currentClass = e.target.value;
  ensureClassScaffolding(currentClass);
  renderAllClassLabels();
  render(currentActiveView());
});
function currentActiveView(){
  return VIEWS.find(v => $('#view-'+v).classList.contains('active')) || 'dashboard';
}
function renderAllClassLabels(){
  ['dashClassName','studClassName','subjClassName','marksClassName','reportClassName','copyIntoClassName']
    .forEach(id=>{ const n=$('#'+id); if(n) n.textContent = currentClass; });
}

/* ---------------- render dispatcher ---------------- */
function render(view){
  renderAllClassLabels();
  if(view==='dashboard') renderDashboard();
  if(view==='students') renderStudents();
  if(view==='subjects') renderSubjects();
  if(view==='marks') renderMarksEntry();
  if(view==='reports') renderReportsView();
  if(view==='settings') renderSettings();
}

/* ================= DASHBOARD ================= */
function renderDashboard(){
  const students = DATA.students[currentClass]||[];
  const subjects = DATA.subjects[currentClass]||[];
  $('#statStudents').textContent = students.length;
  $('#statSubjects').textContent = subjects.length;

  const termsFilled = DATA.terms.filter(t=>{
    const tm = (DATA.marks[currentClass]||{})[t]||{};
    return Object.keys(tm).length>0;
  }).length;
  $('#statTermsFilled').textContent = termsFilled;

  // latest term with any marks
  const latestTerm = [...DATA.terms].reverse().find(t=>{
    const tm=(DATA.marks[currentClass]||{})[t]||{};
    return Object.keys(tm).length>0;
  });

  const tbody = $('#dashRollTable tbody');
  tbody.innerHTML = '';
  let sumPct=0, countPct=0;

  students.forEach(s=>{
    let pctDisplay='—', gradeDisplay='—';
    if(latestTerm){
      const {percentage} = computeStudentResult(currentClass, latestTerm, s.id);
      if(percentage!=null){
        pctDisplay = percentage.toFixed(1)+'%';
        gradeDisplay = gradeFor(percentage).grade;
        sumPct += percentage; countPct++;
      }
    }
    tbody.appendChild(el('tr',{},
      el('td',{},s.roll),
      el('td',{},s.name),
      el('td',{},s.father||'—'),
      el('td',{},pctDisplay),
      el('td',{},gradeDisplay)
    ));
  });

  $('#statAvg').textContent = countPct ? (sumPct/countPct).toFixed(1)+'%' : '—';
  $('#dashEmptyHint').hidden = students.length>0;
}

/* ================= STUDENTS ================= */
function renderStudents(){
  const tbody = $('#studentsTable tbody');
  tbody.innerHTML='';
  const students = DATA.students[currentClass]||[];
  students.sort((a,b)=> (a.roll+'').localeCompare(b.roll+'', undefined, {numeric:true}));
  students.forEach(s=>{
    tbody.appendChild(el('tr',{},
      el('td',{},s.roll),
      el('td',{},s.name),
      el('td',{},s.father||'—'),
      el('td',{},s.dob||'—'),
      el('td',{class:'row-actions'},
        el('button',{class:'icon-btn', title:'Edit', onclick:()=>editStudent(s.id)},'✏️'),
        el('button',{class:'icon-btn', title:'Delete', onclick:()=>deleteStudent(s.id)},'🗑️')
      )
    ));
  });
  $('#studEmptyHint').hidden = students.length>0;
}

$('#studentForm').addEventListener('submit', e=>{
  e.preventDefault();
  const id = $('#studentId').value || uid();
  const roll = $('#studRoll').value.trim();
  const name = $('#studName').value.trim();
  const father = $('#studFather').value.trim();
  const dob = $('#studDOB').value;
  if(!roll || !name) return;

  const list = DATA.students[currentClass];
  const existingIdx = list.findIndex(s=>s.id===id);
  const record = {id, roll, name, father, dob};
  if(existingIdx>-1) list[existingIdx]=record; else list.push(record);
  saveData();
  resetStudentForm();
  renderStudents();
  toast(existingIdx>-1 ? 'Student updated' : 'Student added');
});

function editStudent(id){
  const s = DATA.students[currentClass].find(s=>s.id===id);
  if(!s) return;
  $('#studentId').value = s.id;
  $('#studRoll').value = s.roll;
  $('#studName').value = s.name;
  $('#studFather').value = s.father||'';
  $('#studDOB').value = s.dob||'';
  $('#studentSubmitBtn').textContent = 'Save Changes';
  $('#studentCancelBtn').hidden = false;
  $('#studRoll').focus();
}
function resetStudentForm(){
  $('#studentForm').reset();
  $('#studentId').value='';
  $('#studentSubmitBtn').textContent='Add Student';
  $('#studentCancelBtn').hidden = true;
}
$('#studentCancelBtn').addEventListener('click', resetStudentForm);

function deleteStudent(id){
  if(!confirm('Remove this student? Their marks in this class will also be removed.')) return;
  DATA.students[currentClass] = DATA.students[currentClass].filter(s=>s.id!==id);
  DATA.terms.forEach(t=>{
    if(DATA.marks[currentClass][t]) delete DATA.marks[currentClass][t][id];
  });
  saveData();
  renderStudents();
  toast('Student removed');
}

/* ================= SUBJECTS ================= */
function renderSubjects(){
  const tbody = $('#subjectsTable tbody');
  tbody.innerHTML='';
  const subjects = DATA.subjects[currentClass]||[];
  subjects.forEach((sub,i)=>{
    tbody.appendChild(el('tr',{},
      el('td',{},String(i+1)),
      el('td',{},sub.name),
      el('td',{},String(sub.max)),
      el('td',{},String(sub.min)),
      el('td',{class:'row-actions'},
        el('button',{class:'icon-btn', title:'Edit', onclick:()=>editSubject(sub.id)},'✏️'),
        el('button',{class:'icon-btn', title:'Delete', onclick:()=>deleteSubject(sub.id)},'🗑️')
      )
    ));
  });
  $('#subjEmptyHint').hidden = subjects.length>0;

  // copy-from selector
  const copySel = $('#copyFromClass');
  copySel.innerHTML='';
  DATA.classes.filter(c=>c!==currentClass).forEach(c=> copySel.appendChild(el('option',{value:c},c)));
}

$('#subjectForm').addEventListener('submit', e=>{
  e.preventDefault();
  const id = $('#subjectId').value || uid();
  const name = $('#subjName').value.trim();
  const max = parseFloat($('#subjMax').value);
  let min = parseFloat($('#subjMin').value);
  if(!name || !max) return;
  if(isNaN(min)) min = Math.round(max*0.33);
  if(min > max){ alert('Minimum passing marks cannot be greater than max marks.'); return; }

  const list = DATA.subjects[currentClass];
  const existingIdx = list.findIndex(s=>s.id===id);
  const record = {id, name, max, min};
  if(existingIdx>-1) list[existingIdx]=record; else list.push(record);
  saveData();
  resetSubjectForm();
  renderSubjects();
  toast(existingIdx>-1 ? 'Subject updated' : 'Subject added');
});

function editSubject(id){
  const s = DATA.subjects[currentClass].find(s=>s.id===id);
  if(!s) return;
  $('#subjectId').value = s.id;
  $('#subjName').value = s.name;
  $('#subjMax').value = s.max;
  $('#subjMin').value = s.min;
  $('#subjectSubmitBtn').textContent='Save Changes';
  $('#subjectCancelBtn').hidden=false;
}
function resetSubjectForm(){
  $('#subjectForm').reset();
  $('#subjectId').value='';
  $('#subjMax').value=100;
  $('#subjMin').value=33;
  $('#subjectSubmitBtn').textContent='Add Subject';
  $('#subjectCancelBtn').hidden=true;
}
$('#subjectCancelBtn').addEventListener('click', resetSubjectForm);

function deleteSubject(id){
  if(!confirm('Remove this subject? Marks recorded for it will also be removed.')) return;
  DATA.subjects[currentClass] = DATA.subjects[currentClass].filter(s=>s.id!==id);
  DATA.terms.forEach(t=>{
    Object.values(DATA.marks[currentClass][t]||{}).forEach(rec=> delete rec[id]);
  });
  saveData();
  renderSubjects();
  toast('Subject removed');
}

$('#copySubjectsBtn').addEventListener('click', ()=>{
  const from = $('#copyFromClass').value;
  if(!from) return;
  const src = DATA.subjects[from]||[];
  if(!src.length){ toast('That class has no subjects to copy'); return; }
  const copies = src.map(s=>({id:uid(), name:s.name, max:s.max, min:s.min}));
  DATA.subjects[currentClass] = [...(DATA.subjects[currentClass]||[]), ...copies];
  saveData();
  renderSubjects();
  toast(`Copied ${copies.length} subject(s) from ${from}`);
});

/* ================= MARKS ENTRY ================= */
function populateTermSelects(){
  ['#termSelect','#reportTermSelect'].forEach(sel=>{
    const node = $(sel);
    const prev = node.value;
    node.innerHTML='';
    DATA.terms.forEach(t=> node.appendChild(el('option',{value:t},t)));
    if(DATA.terms.includes(prev)) node.value = prev;
  });
}

function renderMarksEntry(){
  populateTermSelects();
  const term = $('#termSelect').value || DATA.terms[0];
  const subjects = DATA.subjects[currentClass]||[];
  const students = [...(DATA.students[currentClass]||[])].sort((a,b)=>(a.roll+'').localeCompare(b.roll+'',undefined,{numeric:true}));

  const headRow = $('#marksHeadRow');
  headRow.innerHTML = '<th>Roll</th><th>Name</th>';
  subjects.forEach(sub=> headRow.appendChild(el('th',{}, `${sub.name} (max ${sub.max} / pass ${sub.min})`)));
  headRow.appendChild(el('th',{},'Total'));
  headRow.appendChild(el('th',{},'%'));

  const tbody = $('#marksTable tbody');
  tbody.innerHTML='';

  if(!subjects.length || !students.length){
    $('#marksEmptyHint').hidden = false;
    $('#marksTableWrap').style.display='none';
    return;
  }
  $('#marksEmptyHint').hidden = true;
  $('#marksTableWrap').style.display='';

  ensureClassScaffolding(currentClass);
  if(!DATA.marks[currentClass][term]) DATA.marks[currentClass][term] = {};
  const termMarks = DATA.marks[currentClass][term];

  students.forEach(s=>{
    if(!termMarks[s.id]) termMarks[s.id] = {};
    const rec = termMarks[s.id];
    const row = el('tr',{}, el('td',{},s.roll), el('td',{},s.name));

    subjects.forEach(sub=>{
      const input = el('input',{
        type:'number', min:'0', max:String(sub.max), step:'0.5',
        value: rec[sub.id]!=null ? rec[sub.id] : '',
        placeholder:'—'
      });
      if(rec[sub.id]!=null && rec[sub.id] < sub.min) input.classList.add('below-min');
      input.addEventListener('input', ()=>{
        const v = input.value === '' ? null : Math.max(0, Math.min(sub.max, parseFloat(input.value)));
        if(v==null) delete rec[sub.id]; else rec[sub.id]=v;
        input.classList.toggle('below-min', v!=null && v < sub.min);
        saveData();
        updateRowTotal(row, subjects, rec);
        flashSaved();
      });
      row.appendChild(el('td',{}, input));
    });

    row.appendChild(el('td',{class:'rc-total-cell'}, ''));
    row.appendChild(el('td',{class:'rc-pct-cell'}, ''));
    tbody.appendChild(row);
    updateRowTotal(row, subjects, rec);
  });
}

function updateRowTotal(row, subjects, rec){
  const maxTotal = subjects.reduce((a,s)=>a+s.max,0);
  const got = subjects.reduce((a,s)=> a + (rec[s.id]||0), 0);
  const anyEntered = subjects.some(s=> rec[s.id]!=null);
  row.querySelector('.rc-total-cell').textContent = anyEntered ? `${got}/${maxTotal}` : '—';
  row.querySelector('.rc-pct-cell').textContent = anyEntered ? ((got/maxTotal)*100).toFixed(1)+'%' : '—';
}

function flashSaved(){
  const ind = $('#marksSaveIndicator');
  ind.textContent = '✓ saved';
  ind.classList.add('show');
  clearTimeout(flashSaved._t);
  flashSaved._t = setTimeout(()=>ind.classList.remove('show'), 900);
}

$('#termSelect').addEventListener('change', renderMarksEntry);
$('#manageTermsBtn').addEventListener('click', ()=>{
  const input = prompt('Edit terms (comma-separated):', DATA.terms.join(', '));
  if(input==null) return;
  const terms = input.split(',').map(t=>t.trim()).filter(Boolean);
  if(!terms.length) return;
  DATA.terms = terms;
  DATA.classes.forEach(c=>{
    DATA.marks[c] = DATA.marks[c]||{};
    terms.forEach(t=>{ if(!DATA.marks[c][t]) DATA.marks[c][t]={}; });
  });
  saveData();
  populateTermSelects();
  renderMarksEntry();
  toast('Terms updated');
});

/* ================= REPORT CARDS ================= */
function computeStudentResult(cls, term, studentId){
  const subjects = DATA.subjects[cls]||[];
  const rec = ((DATA.marks[cls]||{})[term]||{})[studentId] || {};
  const enteredSubjects = subjects.filter(s=> rec[s.id]!=null);
  if(!enteredSubjects.length) return { percentage:null, total:0, maxTotal:0, rows:[] , rank:null, outOf:null};

  const rows = subjects.map(s=>({
    name:s.name, max:s.max, min:s.min,
    obtained: rec[s.id]!=null ? rec[s.id] : null,
    subjectFail: rec[s.id]!=null ? rec[s.id] < s.min : false
  }));
  const total = enteredSubjects.reduce((a,s)=> a+rec[s.id], 0);
  const maxTotal = enteredSubjects.reduce((a,s)=> a+s.max, 0);
  const percentage = maxTotal ? (total/maxTotal)*100 : null;
  const hasSubjectFail = rows.some(r=> r.subjectFail);

  return { percentage, total, maxTotal, rows, hasSubjectFail };
}

function computeClassRanking(cls, term){
  const students = DATA.students[cls]||[];
  const results = students.map(s=>({
    id:s.id, ...computeStudentResult(cls, term, s.id)
  })).filter(r=> r.percentage!=null);
  results.sort((a,b)=> b.percentage - a.percentage);
  const rankMap = {};
  results.forEach((r,i)=> rankMap[r.id] = {rank:i+1, outOf:results.length});
  return rankMap;
}

function renderReportsView(){
  populateTermSelects();
  const students = [...(DATA.students[currentClass]||[])].sort((a,b)=>(a.roll+'').localeCompare(b.roll+'',undefined,{numeric:true}));
  const sel = $('#reportStudentSelect');
  sel.innerHTML = '<option value="__all__">All students</option>';
  students.forEach(s=> sel.appendChild(el('option',{value:s.id}, `${s.roll} — ${s.name}`)));
  $('#reportCardsHost').innerHTML='';
  $('#reportEmptyHint').hidden = true;
}

$('#generateReportsBtn').addEventListener('click', generateReportCards);
$('#printReportsBtn').addEventListener('click', ()=>{
  if(!$('#reportCardsHost').children.length){ generateReportCards(); }
  setTimeout(()=> window.print(), 150);
});

function generateReportCards(){
  const term = $('#reportTermSelect').value;
  const which = $('#reportStudentSelect').value;
  const students = DATA.students[currentClass]||[];
  const targets = which==='__all__' ? students : students.filter(s=>s.id===which);
  const rankMap = computeClassRanking(currentClass, term);

  const host = $('#reportCardsHost');
  host.innerHTML = '';

  let anyRendered = false;
  targets.forEach(s=>{
    const result = computeStudentResult(currentClass, term, s.id);
    if(result.percentage==null) return;
    anyRendered = true;
    host.appendChild(buildReportCard(s, term, result, rankMap[s.id]));
  });

  $('#reportEmptyHint').hidden = anyRendered;
}

function buildReportCard(student, term, result, rankInfo){
  const g = gradeFor(result.percentage);
  const pass = !result.hasSubjectFail && result.percentage >= (DATA.gradeScale.find(x=>x.grade==='F')?.to+1 || 50);
  const meta = DATA.meta;

  const rowsHtml = result.rows.map(r=> el('tr',{},
    el('td',{}, r.name),
    el('td',{}, String(r.max)),
    el('td',{}, String(r.min)),
    el('td', r.subjectFail? {class:'rc-fail-cell'} : {}, r.obtained!=null ? String(r.obtained) : '—'),
    el('td',{}, r.obtained!=null ? gradeFor((r.obtained/r.max)*100).grade : '—')
  ));

  const card = el('div',{class:'report-card'},
    el('div',{class:'rc-head'},
      el('div',{},
        el('h2',{},meta.schoolName||'School Name'),
        el('p',{},meta.address||''),
        el('p',{},meta.session? `Session: ${meta.session}`:'')
      ),
      el('div',{class:'rc-title'},
        el('span',{class:'rc-doctitle'},`Report Card — ${term}`)
      ),
      el('div',{class:'rc-seal'},
        el('div',{class:'rc-seal-inner'}, g.grade, el('span',{class:'rc-seal-grade'}, result.percentage.toFixed(0)+'%'))
      )
    ),
    el('div',{class:'rc-meta'},
      el('div',{}, el('span',{},'Student Name'), el('strong',{},student.name)),
      el('div',{}, el('span',{},'Roll No.'), el('strong',{},student.roll)),
      el('div',{}, el('span',{},'Class'), el('s
