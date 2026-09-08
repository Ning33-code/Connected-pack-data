/* Local draft and complete, immutable release snapshots. No cloud publication. */
const CP_STORE_KEY='cp_dashboard_workspace_v2';
let cpWorkspace,cpPreview=null,cpTab='versions';
const cpBaseRender=renderAll,cpBaseApply=applyViewOnly;
const cpClone=CPModel.clone;
function cpError(e){alert(e.message||String(e));}
function cpWrite(workspace){
  try{localStorage.setItem(CP_STORE_KEY,JSON.stringify(workspace));}
  catch(e){throw Error('本机保存失败（可能空间不足）。请先导出备份；本次操作未保存。');}
  cpWorkspace=workspace;
}
function cpEdit(){if(!EDIT_MODE||cpPreview||window.__CP_VIEWONLY__)throw Error('历史版本／客户预览不可编辑，请返回草稿');}
function cpCommit(next){cpEdit();CPModel.assert(next);cpWrite({...cpWorkspace,draft:cpClone(next)});state=next;renderAll();}
function cpAttempt(fn){try{return fn();}catch(e){cpError(e);return false;}}
function cpBoot(){
  if(!EDIT_MODE||window.__CP_VIEWONLY__)return;
  try{const raw=localStorage.getItem(CP_STORE_KEY);if(raw){const w=JSON.parse(raw);if(w.schema!==2||!Array.isArray(w.versions)||!w.draft)throw Error('版本备份格式不合法');CPModel.assert(w.draft);cpWorkspace=w;state=cpClone(w.draft);return;}}
  catch(e){cpError(Error('无法读取本机工作区，已停止编辑，避免覆盖原备份。'+e.message));EDIT_MODE=false;VIEW_ONLY=true;return;}
  cpWorkspace={schema:2,draft:cpClone(state),versions:[],publishedId:null};
}
save=function(){
  cpEdit();
  try{CPModel.assert(state);cpWrite({...cpWorkspace,draft:cpClone(state)});}
  catch(e){state=cpClone(cpWorkspace.draft);throw e;}
};
applyViewOnly=function(){
  document.querySelectorAll('.edit-only,.btn:not(.view-available)').forEach(el=>el.style.display='');
  cpBaseApply();
};
renderAll=function(){cpBaseRender();cpToolbar();};
function cpToolbar(){
  if(!EDIT_MODE||window.__CP_VIEWONLY__)return;
  let bar=document.getElementById('cp-version-bar');
  if(!bar){bar=document.createElement('div');bar.id='cp-version-bar';bar.className='toolbar';document.querySelector('.toolbar').after(bar);}
  const v=cpPreview&&cpWorkspace.versions.find(v=>v.id===cpPreview);
  bar.innerHTML='<strong>'+esc(v?'历史快照 · '+v.name:'工作草稿')+'</strong><span style="font-size:12px;color:#747E89">'+(v?'只读 · '+esc(v.createdAt):'修改仅保存在本机；尚未连接网站发布服务')+'</span><span class="spacer"></span>'+
    (v?'<button class="btn view-available" onclick="cpReturn()">返回草稿</button>':'<button class="btn view-available" onclick="cpTab=\'versions\';adminOpen()">版本管理</button>');
}
adminRender=function(){
  const m=document.getElementById('admin-main');
  const tabs=[['versions','版本管理'],['activities','活动管理'],['flow','活动数据'],['mau','MAU 数据'],['transition','Transition 数据']];
  m.innerHTML='<nav style="display:flex;gap:8px;margin-bottom:18px;flex-wrap:wrap">'+tabs.map(([k,n])=>'<button class="admin-btn '+(cpTab===k?'primary':'')+'" onclick="cpTab=\''+k+'\';adminRender()">'+n+'</button>').join('')+'</nav>'+
    ({versions:cpVersions,activities:adminActs,flow:adminFlow,mau:adminMau,transition:adminTrans}[cpTab])();
  if(cpTab==='flow')m.querySelectorAll('input[onchange]').forEach(input=>{const match=input.getAttribute('onchange').match(/^adminSetFlow\((\d+),/);if(match&&state.activities[Number(match[1])].archived)input.closest('tr').remove();});
  document.getElementById('admin-hint').textContent='有效修改自动保存到本机草稿；历史快照不随草稿变化';
  document.querySelector('.admin-panel>footer .primary').textContent='检查并刷新看板';
};
adminSave=function(){cpAttempt(()=>{save();renderAll();toast('草稿校验通过，已保存到本机');});};
function cpVersions(){
  return '<div class="admin-section"><h3>版本与期次</h3><p class="note2">期次是统计截止日期；快照完整保存活动、所有期次、MAU 和 Transition。修正同一期数据时可保存新的快照。</p>'+
    '<div class="prow"><select onchange="switchPeriod(this.value);adminRender()">'+state.periods.map((p,i)=>'<option value="'+i+'" '+(i===state.cur?'selected':'')+'>'+esc(p.date)+'</option>').join('')+'</select> '+
    '<button class="admin-btn sm" onclick="addPeriod()">新增期次</button> <button class="admin-btn sm" onclick="renamePeriod()">修改截止日</button></div></div>'+
    '<div class="admin-section"><h3>保存完整快照</h3><div class="admin-paste"><input id="cp-version-name" placeholder="版本名称，例如 9月第一期 · 校正版" style="width:100%;padding:9px;margin-bottom:8px"><textarea id="cp-version-note" placeholder="本次更新说明"></textarea><button class="admin-btn primary" onclick="cpRelease()">保存快照（本机）</button></div></div>'+
    '<div class="admin-section"><h3>历史快照</h3><p class="note2">保存快照不会更新线上 Hub。云端接通后，再增加正式发布。</p>'+ (cpWorkspace.versions.length?cpWorkspace.versions.slice().reverse().map(v=>'<div class="admin-paste" style="margin-bottom:8px"><strong>'+esc(v.name)+'</strong> · '+esc(v.createdAt)+'<p>'+esc(v.note)+'</p><button class="admin-btn sm" onclick="cpView(\''+v.id+'\')">只读查看</button> <button class="admin-btn sm" onclick="cpRestore(\''+v.id+'\')">恢复为草稿</button></div>').join(''):'暂无快照；建议先保存一份基线。')+'</div>'+
    '<div class="admin-section"><h3>备份</h3><button class="admin-btn" onclick="cpBackup()">导出工作区（草稿＋全部快照）</button> <label class="admin-btn">恢复工作区备份<input type="file" accept=".json" hidden onchange="cpRestoreBackup(this)"></label></div>';
}
function cpRelease(){cpAttempt(()=>{cpEdit();const v=CPModel.snapshot(state,document.getElementById('cp-version-name').value,document.getElementById('cp-version-note').value);cpWrite({...cpWorkspace,draft:cpClone(state),versions:[...cpWorkspace.versions,v]});adminRender();toast('完整快照已保存到本机');});}
function cpView(id){cpAttempt(()=>{const v=cpWorkspace.versions.find(v=>v.id===id);if(!v)throw Error('版本不存在');cpPreview=id;state=cpClone(v.data);VIEW_ONLY=true;adminClose();renderAll();});}
function cpReturn(){cpPreview=null;state=cpClone(cpWorkspace.draft);VIEW_ONLY=false;renderAll();}
function cpRestore(id){cpAttempt(()=>{cpEdit();const v=cpWorkspace.versions.find(v=>v.id===id);if(!v)throw Error('版本不存在');if(!confirm('将该快照恢复为草稿？当前草稿会先自动保存为恢复前快照。'))return;const before=CPModel.snapshot(state,'恢复前自动备份','恢复到 '+v.name);const next=cpClone(v.data);CPModel.assert(next);cpWrite({...cpWorkspace,draft:next,versions:[...cpWorkspace.versions,before]});state=cpClone(next);renderAll();adminRender();});}
function cpDownload(data,name){const u=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
function cpBackup(){cpDownload(cpWorkspace,'Connected-Pack-工作区备份-'+new Date().toISOString().slice(0,10)+'.json');}
function cpRestoreBackup(input){const file=input.files[0];input.value='';if(!file)return;file.text().then(t=>cpAttempt(()=>{cpEdit();const w=JSON.parse(t);if(w.schema!==2||!Array.isArray(w.versions))throw Error('不是工作区备份');CPModel.assert(w.draft);const ids=new Set();for(const v of w.versions){if(!/^v_[a-z0-9_]+$/.test(v.id)||ids.has(v.id))throw Error('版本 ID 非法或重复');ids.add(v.id);CPModel.assert(v.data);}if(!confirm('恢复备份并替换当前工作区？请先导出当前工作区备份。'))return;cpWrite(w);state=cpClone(w.draft);renderAll();adminRender();})).catch(cpError);}
addPeriod=function(){cpAttempt(()=>{cpEdit();const d=prompt('新增期次截止日期（YYYY-MM-DD）');if(!d)return;if(!CPModel.date(d)||state.periods.some(p=>p.date===d))throw Error('日期非法或期次已存在');const next=cpClone(state);next.periods.push({date:d,d:{}});next.cur=next.periods.length-1;cpCommit(next);adminRender();});};
renamePeriod=function(){cpAttempt(()=>{cpEdit();const d=prompt('当前期次截止日期（YYYY-MM-DD）',curP().date);if(!d)return;const next=cpClone(state);next.periods[next.cur].date=d;cpCommit(next);adminRender();});};
delPeriod=function(){toast('期次保留用于追溯；可在版本管理修正截止日期');};
setLabel=function(){toast('展示模板已固定');};
renderLabelPanel=function(){};
actCell=function(a){return '<div class="actcell"><div><strong>'+esc(a.name)+'</strong><div class="asku-text">'+esc(a.sku||'')+'</div>'+(a.archived?'<span class="badge-end">已归档</span>':'')+'</div></div>';};
dispDate=function(a,f,ph){return '<span class="pdate-t">'+esc(a[f]?ddisp(a[f]):ph)+'</span>';};
setMeta=function(){toast('请到活动管理修改活动信息');};
addAct=function(type){cpAttempt(()=>{cpEdit();if(!document.getElementById('admin').classList.contains('on')||cpTab!=='activities'){cpTab='activities';adminOpen();return;}const name=prompt('活动名称');if(!name||!name.trim())return;const code=prompt('固定活动 ID（使用平台活动编号；创建后不可更改）');if(!code)return;if(state.activities.some(a=>a.code===code.trim()))throw Error('活动 ID 已存在');if(/["'<>\\\s]/.test(code.trim()))throw Error('活动 ID 请勿包含空格、引号或尖括号');const next=cpClone(state);next.activities.push({code:code.trim(),name:name.trim(),type,sku:'',pstart:'',pend:'',archived:false});cpCommit(next);adminRender();});};
adminActs=function(){return '<div class="admin-section"><h3>活动管理</h3><p class="note2">先创建活动，再录入数据。固定 ID 关联所有期次；有数据的活动只能归档。活动名称、SKU 和日期可以维护。</p><div class="admin-grid"><table><thead><tr><th>活动名称</th><th>固定 ID</th><th>类型</th><th>SKU</th><th>开始日期</th><th>结束日期</th><th>操作</th></tr></thead><tbody>'+state.activities.map((a,i)=>'<tr><td><input value="'+esc(a.name)+'" onchange="adminSetAct('+i+',\'name\',this.value)"></td><td>'+esc(a.code)+'</td><td>'+(a.type==='utc'?'UTC':'瓶身码')+'</td><td><input value="'+esc(a.sku||'')+'" onchange="adminSetAct('+i+',\'sku\',this.value)"></td><td><input type="date" value="'+esc(a.pstart||'')+'" onchange="adminSetAct('+i+',\'pstart\',this.value)"></td><td><input type="date" value="'+esc(a.pend||'')+'" onchange="adminSetAct('+i+',\'pend\',this.value)"></td><td><button class="admin-btn sm" onclick="cpArchive('+i+')">'+(a.archived?'恢复':'归档')+'</button> '+(!CPModel.hasData(state,a.code)?'<button class="admin-btn sm danger" onclick="adminDelAct('+i+')">删除空活动</button>':'')+'</td></tr>').join('')+'</tbody></table></div><p><button class="admin-btn" onclick="addAct(\'bottle\')">新增瓶身码活动</button> <button class="admin-btn" onclick="addAct(\'utc\')">新增 UTC 活动</button></p></div>';};
adminSetAct=function(i,f,v){cpAttempt(()=>{if(!['name','sku','pstart','pend'].includes(f))throw Error('活动 ID 和类型创建后固定');const next=cpClone(state);next.activities[i][f]=v.trim();cpCommit(next);adminRender();});};
function cpArchive(i){cpAttempt(()=>{const next=cpClone(state);next.activities[i].archived=!next.activities[i].archived;cpCommit(next);adminRender();});}
adminDelAct=function(i){cpAttempt(()=>{const a=state.activities[i];if(CPModel.hasData(state,a.code))throw Error('活动已有数据，请归档');if(!confirm('删除未填写数据的活动「'+a.name+'」？'))return;const next=cpClone(state);next.activities.splice(i,1);next.periods.forEach(p=>delete p.d[a.code]);cpCommit(next);adminRender();});};
delAct=function(){cpTab='activities';adminOpen();};
setv=function(code,f,v){cpAttempt(()=>{cpEdit();const next=cpClone(state);CPModel.setFlow(next,code,curP().date,f,v);CPModel.assert(next);cpWrite({...cpWorkspace,draft:cpClone(next)});state=next;refresh();});};
adminSetFlow=function(i,f,v){setv(state.activities[i].code,f,v);};
const cpOldFlow=adminFlow;
adminFlow=function(){
  let html=cpOldFlow();
  html=html.replace('在 Excel 里选中数值区域复制，直接粘到下面。按上表的行序对应；每行可以带活动名（会自动忽略首列）。','复制固定活动 ID 和后续指标列，按 ID 匹配，不依赖行序。未知／归档活动、重复行或非法数字会使整批导入中止。');
  html=html.replace('placeholder="405082','placeholder="2026CNY&#9;405082');
  html=html.replace('下面填的是这一期的累计值。','下面填的是这一期的累计值。已归档活动不提供录入行，历史数据保留。');
  html=html.replace('从 Excel 整列粘贴','从 Excel 按活动 ID 粘贴');
  html+='<div class="admin-section"><h3>文件导入到草稿</h3><p class="note2">只更新已登记活动和已创建期次；未提供的活动、MAU、Transition 保留。Excel 数据表需要 period、code 与指标字段表头。</p><label class="admin-btn">导入 Excel<input type="file" hidden accept=".xlsx,.xls" onchange="importExcel(this)"></label> <label class="admin-btn">导入数据 JSON<input type="file" hidden accept=".json" onchange="importData(this)"></label></div>';
  return html;
};
adminPasteFlow=function(){cpAttempt(()=>{const next=CPModel.paste(state,document.getElementById('pf-text').value,document.getElementById('pf-which').value,curP().date);cpConfirmImport(next);});};
function cpConfirmImport(next){CPModel.assert(next);let changed=0;for(const p of next.periods){const old=state.periods.find(x=>x.date===p.date);for(const [c,d] of Object.entries(p.d))for(const [f,v] of Object.entries(d))if(v!==((old&&old.d[c])||{})[f])changed++;}for(const [section,id,keys] of [['mau','month',CPModel.MAU],['transition','id',CPModel.TRANS]])for(const r of next[section]){const old=state[section].find(x=>x[id]===r[id]);keys.forEach(k=>{if(r[k]!==((old||{})[k]))changed++;});}if(!changed){toast('数据没有变化');return;}if(!confirm('校验通过：将更新 '+changed+' 个数据字段到草稿。未提供的数据保留。是否填入？'))return;cpCommit(next);adminRender();toast('数据已更新到本机草稿');}
importData=function(input){const f=input.files[0];input.value='';if(f)f.text().then(t=>cpAttempt(()=>cpConfirmImport(CPModel.mergePayload(state,JSON.parse(t))))).catch(cpError);};
importExcel=function(input){const f=input.files[0];input.value='';if(!f)return;f.arrayBuffer().then(buf=>cpAttempt(()=>{
  if(typeof XLSX==='undefined')throw Error('Excel 组件未加载');const wb=XLSX.read(buf,{type:'array',cellDates:true});
  function rows(ws,required){const aoa=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:null});const i=aoa.findIndex(r=>required.every(k=>r.includes(k)));if(i<0)throw Error('找不到字段表头：'+required.join('、'));const h=aoa[i].map(v=>String(v||'').trim());if(new Set(h.filter(Boolean)).size!==h.filter(Boolean).length)throw Error('字段表头重复');return aoa.slice(i+1).filter(r=>r.some(v=>v!=null&&v!=='')).map(r=>Object.fromEntries(h.filter(Boolean).map(k=>[k,r[h.indexOf(k)]])));}
  const flow=rows(wb.Sheets['数据']||wb.Sheets[wb.SheetNames[0]],['period','code']).map(r=>({...r,code:String(r.code||'').trim(),period:normPeriod(r.period)}));
  let next=CPModel.mergeRows(state,flow);
  if(wb.Sheets.MAU){const mau=rows(wb.Sheets.MAU,['month','wx_mau']).map(r=>({...r,month:r.month instanceof Date?normPeriod(r.month).slice(0,7):String(r.month||'').trim()}));next=CPModel.mergePayload(next,{periods:[],mau});}
  if(wb.Sheets.Transition)next=CPModel.mergePayload(next,{periods:[],transition:rows(wb.Sheets.Transition,['id','sku'])});
  cpConfirmImport(next);
})).catch(cpError);};
adminSyncRun=async function(){try{cpEdit();const c=syncCfg();if(!c.endpoint)throw Error('尚未连接同步接口');const r=await fetch(c.endpoint,{headers:{Accept:'application/json'},cache:'no-store'});if(!r.ok)throw Error('同步失败：'+r.status);cpConfirmImport(CPModel.mergePayload(state,await r.json()));}catch(e){cpError(e);}};
syncValidate=CPModel.validate;
adminSetMau=function(month,f,v){cpAttempt(()=>{if(!CPModel.MAU.includes(f))throw Error('非法指标');const next=CPCloneMau(month);next.mau.find(r=>r.month===month)[f]=CPModel.number(v);cpCommit(next);});};
function CPCloneMau(month){const next=cpClone(state);if(!next.mau.some(r=>r.month===month))next.mau.push({month,wx_mau:null,wx_label:null,ali_mau:null,ali_chunyue:null});next.mau.sort((a,b)=>a.month.localeCompare(b.month));return next;}
setMau=function(i,f,v){cpAttempt(()=>{cpEdit();if(!CPModel.MAU.includes(f))throw Error('非法指标');const next=cpClone(state);next.mau[i][f]=CPModel.number(v);CPModel.assert(next);cpWrite({...cpWorkspace,draft:cpClone(next)});state=next;renderMau();const row=state.mau[i],pct=(n,d)=>n!=null&&d>0?(n/d*100).toFixed(1)+'%':'—';const wx=document.getElementById('mpw-'+i),ali=document.getElementById('mpa-'+i);if(wx)wx.textContent=pct(row.wx_label,row.wx_mau);if(ali)ali.textContent=pct(row.ali_chunyue,row.ali_mau);});};
adminPasteMau=function(){cpAttempt(()=>{const f=document.getElementById('pm-field').value;let cells=document.getElementById('pm-text').value.trim().split('\t');if(cells.length>12||!cells.length)throw Error('请复制 1–12 个月的数值单元格，不含行名');let next=cpClone(state);cells.forEach((v,i)=>{const month=adminMauYear()+'-'+String(i+1).padStart(2,'0');let row=next.mau.find(r=>r.month===month);if(!row){row={month};next.mau.push(row);}row[f]=CPModel.number(v);});cpConfirmImport(next);});};
adminTrans=function(){return '<div class="admin-section"><h3>Transition 数据</h3><p class="note2">只填写原始数值；品牌、汇报范围、上图范围与计算口径固定。</p><div class="admin-grid"><table><thead><tr><th>品牌</th>'+T_FIELDS.map(f=>'<th>'+f[1]+'</th>').join('')+'</tr></thead><tbody>'+state.transition.map((b,i)=>'<tr><td>'+esc(b.name)+'</td>'+T_FIELDS.map(f=>'<td><input value="'+(b[f[0]]==null?'':b[f[0]])+'" onchange="adminSetTrans('+i+',\''+f[0]+'\',this.value)"></td>').join('')+'</tr>').join('')+'</tbody></table></div></div>';};
adminSetTrans=function(i,f,v){cpAttempt(()=>{if(!CPModel.TRANS.includes(f))throw Error('展示口径固定');const next=cpClone(state);next.transition[i][f]=CPModel.number(v,!f.toLowerCase().includes('volume'));cpCommit(next);});};
publish=function(){toast('请在版本管理保存本机快照；网站发布服务尚未接通');};
loadLive=function(){toast('请使用数据导入更新草稿');};
// Guard every legacy edit route, including ones reachable outside the management panel.
for(const name of ['setv','setMau','addMauMonth','delMauMonth','adminSetFlow','adminSetAct','adminDelAct','adminSetMau','adminSetTrans','adminPasteMau','adminPasteFlow','addAct','delAct','setMeta','importData','importExcel']){
  const fn=window[name];window[name]=function(...args){return cpAttempt(()=>{cpEdit();return fn(...args);});};
}
switchPeriod=function(i){const n=Number(i);if(!Number.isInteger(n)||n<0||n>=state.periods.length)return;state.cur=n;if(!VIEW_ONLY)cpAttempt(()=>save());renderAll();};
cpBoot();
