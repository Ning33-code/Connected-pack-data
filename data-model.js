/* Shared data rules for manual entry, Excel, JSON and future cloud updates. */
(function(root){
  'use strict';
  const FLOW=['hcp_pv','hcp_uv','hoth_pv','hoth_uv','kcp_pv','kcp_uv','koth_pv','koth_uv'];
  const UTC=['scan_cnt','scan_ppl'];
  const MAU=['wx_mau','wx_label','ali_mau','ali_chunyue'];
  const TRANS=['sku','connected','toggle','volume','connectedVolume'];
  const clone=x=>JSON.parse(JSON.stringify(x));
  const fields=a=>a.type==='utc'?UTC:FLOW;
  const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
  function date(s){return typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;}
  function number(v,integer=true){
    if(v==null||String(v).trim()===''||/^[—–-]$/.test(String(v).trim()))return null;
    const s=String(v).trim();
    if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(s))throw Error('不是有效的非负数字：'+s);
    const n=Number(s.replace(/,/g,''));
    if(!Number.isFinite(n)||n>Number.MAX_SAFE_INTEGER||(integer&&!Number.isInteger(n)))throw Error('数值超出范围或必须是整数：'+s);
    return n;
  }
  function activity(s,code){const a=s.activities.find(a=>a.code===code);if(!a)throw Error('请先在活动管理创建活动：'+code);return a;}
  function hasData(s,code){return s.periods.some(p=>Object.values((p.d||{})[code]||{}).some(v=>v!==null&&v!==''&&v!==undefined));}
  function validate(s){
    const errors=[];const attempt=f=>{try{f();}catch(e){errors.push(e.message);}};
    if(!s||!Array.isArray(s.activities)||!Array.isArray(s.periods)||!s.periods.length)return ['缺少活动清单或期次'];
    const codes=new Set(),dates=new Set();
    s.activities.forEach(a=>attempt(()=>{
      if(!a||typeof a.code!=='string'||!a.code.trim()||['__proto__','constructor','prototype'].includes(a.code)||codes.has(a.code))throw Error('活动 ID 缺失、重复或非法');
      codes.add(a.code);
      if(!String(a.name||'').trim()||!['bottle','utc'].includes(a.type))throw Error(a.code+'：活动名或类型不完整');
      if((a.pstart&&!date(a.pstart))||(a.pend&&!date(a.pend))||(a.pstart&&a.pend&&a.pstart>a.pend))throw Error(a.code+'：活动起止日期不合法');
    }));
    s.periods.forEach(p=>attempt(()=>{
      if(!p||!date(p.date)||dates.has(p.date))throw Error('期次日期非法或重复：'+(p&&p.date));dates.add(p.date);
      if(!p.d||typeof p.d!=='object'||Array.isArray(p.d))throw Error(p.date+'：数据格式错误');
      Object.entries(p.d).forEach(([code,d])=>attempt(()=>{
        const a=activity(s,code);if(!d||typeof d!=='object'||Array.isArray(d))throw Error(code+'：数据格式错误');
        Object.entries(d).forEach(([f,v])=>{if(!fields(a).includes(f))throw Error(code+'：字段与活动类型不符 '+f);number(v);});
      }));
    }));
    for(const [key,keys,id] of [['mau',MAU,'month'],['transition',TRANS,'id']]){
      if(!Array.isArray(s[key])){errors.push(key+' 数据必须是数组');continue;}
      const seen=new Set();
      s[key].forEach(r=>attempt(()=>{
        if(!r||!r[id]||seen.has(r[id]))throw Error(key+' 标识缺失或重复');seen.add(r[id]);
        if(key==='mau'&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(r.month))throw Error('月份格式错误：'+r.month);
        keys.forEach(k=>number(r[k],key!=='transition'||!k.toLowerCase().includes('volume')));
      }));
    }
    return errors;
  }
  function assert(s){const e=validate(s);if(e.length)throw Error(e.slice(0,12).join('\n'));return s;}
  function setFlow(s,code,period,f,v){const a=activity(s,code);if(a.archived)throw Error('活动已归档，请先在活动管理恢复');if(!fields(a).includes(f))throw Error('指标与活动类型不匹配');const p=s.periods.find(p=>p.date===period);if(!p)throw Error('请先创建期次');const n=number(v);if(!p.d[code])p.d[code]={};p.d[code][f]=n;}
  function mergeRows(s,rows){
    const next=clone(s),seen=new Set();let count=0;
    for(const row of rows){
      const a=activity(next,row.code);if(a.archived)throw Error('活动已归档：'+a.name);
      if(!date(row.period)||!next.periods.some(p=>p.date===row.period))throw Error('请先在版本管理创建期次：'+row.period);
      const key=JSON.stringify([row.period,row.code]);if(seen.has(key))throw Error('同一期活动重复：'+row.code);seen.add(key);
      if(row.type&&row.type!==a.type)throw Error('活动类型不一致：'+a.code);
      let touched=0;
      for(const f of [...FLOW,...UTC])if(own(row,f)){
        if(!fields(a).includes(f)){if(row[f]!=null&&String(row[f]).trim()!=='')throw Error('活动类型与指标不匹配：'+a.code+' / '+f);continue;}
        setFlow(next,a.code,row.period,f,row[f]);touched++;
      }
      if(!touched)throw Error('活动缺少指标列：'+a.code);count++;
    }
    if(!count)throw Error('没有可导入的数据');return assert(next);
  }
  function paste(s,text,type,period){
    const fs=type==='utc'?UTC:FLOW;
    const rows=text.split(/\r?\n/).filter(l=>l.trim()).map((line,i)=>{
      const cells=line.split('\t');if(cells.length!==fs.length+1)throw Error('第 '+(i+1)+' 行：首列必须是活动 ID，后接 '+fs.length+' 列指标（从 Excel 连同 ID 复制）');
      const row={code:cells[0].trim(),type,period};fs.forEach((f,j)=>row[f]=cells[j+1]);return row;
    });return mergeRows(s,rows);
  }
  function mergePayload(s,payload){
    if(!payload||!Array.isArray(payload.periods))throw Error('缺少 periods');
    // Activity master data is never created or overwritten by a data import.
    if(payload.activities)for(const a of payload.activities){const old=activity(s,a.code);if(a.type&&a.type!==old.type)throw Error('活动类型不一致：'+a.code);}
    const rows=[];for(const p of payload.periods){if(!p.d||typeof p.d!=='object')throw Error('期次数据格式错误');for(const [code,d] of Object.entries(p.d))rows.push({...d,code,period:p.date});}
    let next=rows.length?mergeRows(s,rows):clone(s);
    if(payload.mau){if(!Array.isArray(payload.mau))throw Error('MAU 格式错误');const seen=new Set();for(const r of payload.mau){if(seen.has(r.month))throw Error('MAU 月份重复');seen.add(r.month);let target=next.mau.find(x=>x.month===r.month);if(!target){target={month:r.month};next.mau.push(target);}for(const k of MAU)if(own(r,k))target[k]=number(r[k]);}}
    if(payload.transition){if(!Array.isArray(payload.transition))throw Error('Transition 格式错误');const seen=new Set();for(const r of payload.transition){if(seen.has(r.id))throw Error('品牌重复');seen.add(r.id);const target=next.transition.find(x=>x.id===r.id);if(!target)throw Error('未知品牌：'+r.id);for(const k of TRANS)if(own(r,k))target[k]=number(r[k],!k.toLowerCase().includes('volume'));}}
    return assert(next);
  }
  function snapshot(s,name,note){assert(s);if(!String(name||'').trim())throw Error('请填写版本名称');return {id:'v_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8),name:String(name).trim(),note:String(note||''),createdAt:new Date().toISOString(),data:clone(s)};}
  const api={FLOW,UTC,MAU,TRANS,clone,date,number,activity,hasData,validate,assert,setFlow,mergeRows,paste,mergePayload,snapshot};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CPModel=api;
})(typeof window!=='undefined'?window:globalThis);
