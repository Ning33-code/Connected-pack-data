/* Internal workflow: one management page, Tencent sheets hold raw data. */
let cpSyncBusy=false,cpSyncMessage='';
const CP_DOC_URL='https://docs.qq.com/sheet/DTkNkT29HUHJiVnVD';
cpToolbar=function(){const bar=document.getElementById('cp-version-bar');if(bar)bar.remove();};
function cpSyncPanel(){
  const last=cpWorkspace.lastSync;
  return '<section class="admin-section"><h3>腾讯文档数据</h3><p class="note2">流量／MAU／Transition 三张表在同一份腾讯文档里，在里面批量粘贴，或由 AI 更新。看板通过活动 ID 关联数据。</p>'+
    '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><a class="admin-btn" style="text-decoration:none" href="'+CP_DOC_URL+'" target="_blank" rel="noreferrer">打开腾讯文档 ↗</a>'+
    '<button class="admin-btn primary" id="sync-btn" onclick="adminSyncRun()" '+(cpSyncBusy?'disabled':'')+'>'+(cpSyncBusy?'同步中…':'同步数据')+'</button></div>'+
    '<p class="note2" style="margin-top:10px">'+(last?'最近同步：'+esc(new Date(last.at).toLocaleString('zh-CN'))+' · '+last.periods+' 期数据':'尚未同步腾讯文档，当前显示已有看板数据')+'</p>'+
    '<div id="cp-sync-result" role="status" style="white-space:pre-wrap;font-size:12px;line-height:1.8;color:#a51221">'+esc(cpSyncMessage||(!syncCfg().endpoint?'同步接口尚未接通；可先维护活动和腾讯文档。':''))+'</div>'+
    '<details style="margin-top:8px;font-size:11px;color:#747E89"><summary>同步连接设置</summary><p>部署同步服务后配置一次。</p><button class="admin-btn sm" onclick="syncSetup()">设置连接</button></details></section>';
}
// Report/chart 归属只在本机勾选决定，同一批 TRANS 字段之外单独处理：
// CPModel.TRANS 是"同步会覆盖的数值字段"清单，report/chart 不在里面，
// 所以腾讯文档同步不会碰这两个勾选，跟看板数字的更新彻底分开。
function cpTransFlags(){
  return '<section class="admin-section"><h3>Transition 展示口径</h3><p class="note2">是否计入汇报合计、是否在柱状图单独出柱；只在本机生效，同步腾讯文档不会覆盖这两列。</p>'+
    '<div class="admin-grid"><table><thead><tr><th class="l">品牌</th><th>计入汇报</th><th>柱上体现</th></tr></thead><tbody>'+
    state.transition.map((b,i)=>'<tr><td class="rowhead">'+esc(b.name)+'</td>'+
      '<td><input type="checkbox" '+(b.report?'checked':'')+' onchange="cpSetTransFlag('+i+',\'report\',this.checked)"></td>'+
      '<td><input type="checkbox" '+(b.chart?'checked':'')+' onchange="cpSetTransFlag('+i+',\'chart\',this.checked)"></td></tr>').join('')+
    '</tbody></table></div></section>';
}
function cpSetTransFlag(i,f,checked){cpAttempt(()=>{if(f!=='report'&&f!=='chart')throw Error('非法字段');const next=cpClone(state);next.transition[i][f]=checked?1:0;cpCommit(next);});}
adminRender=function(){
  cpTab='activities';
  document.getElementById('admin-main').innerHTML=cpSyncPanel()+cpTransFlags()+adminActs();
  document.getElementById('admin-hint').textContent='活动修改自动保存；同步失败时保留现有数据';
  document.querySelector('.admin-panel>footer .primary').style.display='none';
};
// Raw metrics are read only on the internal dashboard as well: edit them in sheets.
const cpInternalRender=renderAll;
renderAll=function(){
  cpInternalRender();
  document.querySelectorAll('#tbody-b input,#tbody-u input,#mau-table input').forEach(el=>{el.readOnly=true;el.removeAttribute('oninput');el.removeAttribute('onchange');});
  document.querySelectorAll('#mau-table button').forEach(el=>el.style.display='none');
};
// Sorting also rebuilds metric tables; keep those rebuilt inputs read only.
for(const name of ['renderTable','renderUTC','renderMauTable']){
  const original=window[name];window[name]=function(...args){const result=original(...args);document.querySelectorAll('#tbody-b input,#tbody-u input,#mau-table input').forEach(el=>{el.readOnly=true;el.removeAttribute('oninput');el.removeAttribute('onchange');});document.querySelectorAll('#mau-table button').forEach(el=>el.style.display='none');return result;};
}
function cpMergeSheets(current,payload){
  if(!payload||!Array.isArray(payload.periods)||!payload.periods.length||!Array.isArray(payload.mau)||!payload.mau.length||!Array.isArray(payload.transition)||!payload.transition.length)throw Error('同步失败：需要完整的流量、MAU、Transition 三张表；看板未更新。');
  const known=new Set(current.activities.map(a=>a.code)),unknown=new Set();
  for(const p of payload.periods)for(const code of Object.keys(p.d||{}))if(!known.has(code))unknown.add(code);
  for(const a of payload.activities||[])if(!known.has(a.code))unknown.add(a.code);
  if(unknown.size)throw Error('同步失败：发现 '+unknown.size+' 个未登记活动\n'+[...unknown].map(code=>'• '+code).join('\n')+'\n请先在下方创建活动，或修正腾讯文档中的活动 ID，再重新同步。看板数据未变动。');
  const next=cpClone(current),dates=new Set();
  for(const p of payload.periods){if(!CPModel.date(p.date)||dates.has(p.date))throw Error('同步失败：期次日期错误或重复 '+p.date);dates.add(p.date);if(!next.periods.some(x=>x.date===p.date))next.periods.push({date:p.date,d:{}});}
  // Archived activities remain registered and their historical sheet rows remain readable.
  next.activities.forEach(a=>a.archived=false);
  const result=CPModel.mergePayload(next,payload);
  result.activities=cpClone(current.activities);
  result.periods.sort((a,b)=>b.date.localeCompare(a.date));result.cur=0;
  return CPModel.assert(result);
}
adminSyncRun=async function(){
  if(cpSyncBusy)return;
  let controller;
  try{
    cpEdit();const endpoint=syncCfg().endpoint;if(!endpoint)throw Error('同步接口尚未接通，暂时不能从腾讯文档读取。当前数据未变动。');
    cpSyncBusy=true;cpSyncMessage='正在读取三张表并检查活动关联…';adminRender();
    controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),30000);let payload;
    try{const response=await fetch(endpoint,{headers:{Accept:'application/json'},cache:'no-store',signal:controller.signal});if(!response.ok)throw Error('读取失败（'+response.status+'），当前数据未变动。');payload=await response.json();}finally{clearTimeout(timeout);}
    const next=cpMergeSheets(state,payload);
    // A single durable write commits all three sheets and preserves the previous state.
    cpWrite({...cpWorkspace,lastSyncBackup:cpClone(state),draft:cpClone(next),lastSync:{at:new Date().toISOString(),periods:next.periods.length}});
    state=next;renderAll();cpSyncMessage='同步成功：流量、MAU、Transition 已一起更新。';
  }catch(e){cpSyncMessage=e.name==='AbortError'?'同步超时，当前数据未变动。请稍后重试。':e.message;}
  finally{cpSyncBusy=false;adminRender();}
};
