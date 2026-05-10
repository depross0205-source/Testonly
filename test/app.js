var DAILY={}, RAW_SCORES={}, BT_RESULT=null, CHART={}, CACHE_BUILT=false, CACHE_TS=null, SKIP_MO=false, CACHE_SKIP_MO=false, CORR_WIN=24;
var CACHE_SIG=null, PRICE_INDEX_CACHE={}, PRICE_DATE_CACHE={}, TN_DATE_CACHE={}, CORR_CACHE={};
var N_TREND=60; var MOM_CONSISTENCY_MULT=1.2; var REBAL_FREQ="1";

function updTotalH() {
  var t = gv('btQuotaTW') + gv('btQuotaUS') + gv('btQuotaETF');
  if (document.getElementById('poolMode').value === 'small') {
    if ($('btH')) $('btH').value = t;
  }
}

function togglePoolUI() {
  var isLarge = document.getElementById('poolMode').value === 'large';
  ['btQuotaTW', 'btQuotaUS', 'btQuotaETF'].forEach(function(id) {
    var el = document.getElementById(id);
    if(el) { el.disabled = isLarge; el.style.opacity = isLarge ? "0.3" : "1"; }
  });
  var hInput = document.getElementById('btH');
  if(hInput) { hInput.disabled = !isLarge; hInput.style.background = isLarge ? "var(--bg)" : "rgba(255,255,255,0.05)"; }
  if (!isLarge) updTotalH();
}

function renderPool() {
  var container = document.getElementById('poolContainer');
  if (!container) return;
  container.innerHTML = '';
  POOL_DEF.forEach(function(g, gi) {
    var ibId = 'ib_g' + gi;
    var icId = 'ic_g' + gi;
    var div = document.createElement('div');
    div.className = 'ig';
    var total = g.stocks.length;
    div.innerHTML =
      '<div class="ih" onclick="toggleInd(this)">' +
        '<span class="in">' + g.title + '</span>' +
        '<span style="display:inline-flex;align-items:center;gap:3px;margin-right:6px">' +
          '<button class="bo sm" style="padding:1px 5px;font-size:10px;color:var(--gr);border-color:var(--gr)" onclick="event.stopPropagation();selectGroup(this,true)">全</button>' +
          '<button class="bo sm" style="padding:1px 5px;font-size:10px;color:var(--re);border-color:var(--re)" onclick="event.stopPropagation();selectGroup(this,false)">停</button>' +
        '</span>' +
        '<span class="ic" id="' + icId + '">' + total + '/' + total + '</span>' +
      '</div>' +
      '<div class="ib" id="' + ibId + '"></div>';
    container.appendChild(div);
    var ib = div.querySelector('.ib');
    g.stocks.forEach(function(s) {
      var isUS = !g.tw;
      var locked = s.locked || s.c === 'SGOV';
      var groupTitle = (g.title || '').toUpperCase();
      var groupPool = (s.pool || g.pool || '').toLowerCase();
      var isETFGroup = groupPool === 'etf' || groupTitle.indexOf('[ETF]') !== -1;

      // 預設選取規則：ETF 只保留 SPY / SGOV 為 ON，其餘 ETF 預設 OFF。
      // 非 ETF 維持原本 defaultOn 設定；CN 概念股仍依原設定 defaultOn:false。
      var defaultOn = (s.defaultOn === false || g.defaultOn === false) ? false : true;
      if (isETFGroup) defaultOn = (s.c === 'SPY' || s.c === 'SGOV');

      var chip = document.createElement('span');
      chip.className = 'sc' + (defaultOn ? ' act' : '') + (isUS ? ' usc' : '');
      chip.dataset.code = s.c;
      chip.dataset.type = locked ? 'tw50' : 'mid';
      chip.dataset.tw = g.tw ? '1' : '0';
      chip.dataset.pool = s.pool || g.pool || '';
      chip.dataset.region = s.region || g.region || '';
      chip.dataset.industry = s.industry || g.industry || g.title || '';
      chip.dataset.sector = s.sector || g.sector || '';
      chip.dataset.subInd = s.subInd || '';
      chip.dataset.on = defaultOn ? '1' : '0';
      chip.setAttribute('onclick', "toggleStock('" + s.c + "')");
      var inner = '<span class="cc">' + s.c + '</span>' +
                  '<span class="cn">' + s.n + '</span>';
      if (!locked) {
        inner += '<span class="cd" onclick="event.stopPropagation();deleteStock(\'' + s.c + '\')">\u00d7</span>';
      }
      chip.innerHTML = inner;
      ib.appendChild(chip);
    });
    updCountByIb(ib);
  });
}

function getEnabledStocks() {
  var result = [];
  document.querySelectorAll('[data-code][data-on="1"]').forEach(function(el) {
    var cn = el.querySelector('.cn');
    var code = el.dataset.code;
    var tw = el.dataset.tw === '1';
    var igNode = el.closest('.ig');
    var inSpan = igNode ? igNode.querySelector('.in') : null;
    var title = inSpan ? inSpan.textContent.toUpperCase() : '';
    var pool = el.dataset.pool || 'other';
    var region = el.dataset.region || '';
    if (!pool || pool === 'other') {
      if (tw) { pool = 'tw'; }
      else if (title.indexOf('[ETF]') !== -1) { pool = 'etf'; }
      else if (title.indexOf('[US]') !== -1 || title.indexOf('[CN]') !== -1 || title.indexOf('[JP]') !== -1) { pool = 'us'; }
    }
    var industry = el.dataset.industry || title;
    var sector = el.dataset.sector || industry;
    result.push({c: code, n: cn ? cn.textContent : '', type: el.dataset.type, tw: tw, pool: pool, region: region, ind: industry, industry: industry, sector: sector, subInd: el.dataset.subInd || ''});
  });
  return result;
}

var DB_NAME='FearlessConsoleDB', DB_VERSION=1;
function initDB(){return new Promise(function(resolve,reject){var request=indexedDB.open(DB_NAME,DB_VERSION);request.onupgradeneeded=function(e){var db=e.target.result;if(!db.objectStoreNames.contains('stockData'))db.createObjectStore('stockData',{keyPath:'id'});};request.onsuccess=function(){resolve(request.result);};request.onerror=function(){reject(request.error);};});}
async function saveAllToDB(){try{var db=await initDB();var tx=db.transaction('stockData','readwrite');tx.objectStore('stockData').put({id:'main_cache',DAILY:DAILY,ts:new Date().toISOString()});}catch(e){console.error('DB Error:',e);}}
async function loadFromDB(){try{var db=await initDB();var tx=db.transaction('stockData','readonly');var request=tx.objectStore('stockData').get('main_cache');return new Promise(function(resolve){request.onsuccess=async function(){var res=request.result;if(res){DAILY=res.DAILY||{};updFetchStat();updTNX();markCacheDirty('loadFromDB');sl('dlLog','從資料庫恢復成功 ('+res.ts.slice(0,16).replace('T',' ')+')，Cache 將延後建立。',true);resolve(true);}else resolve(false);};});}catch(e){return false;}}


function getCacheSignature(){
  try{
    var codes=getEnabledStocks().map(function(s){return s.c;}).sort();
    var parts=codes.map(function(c){
      var b=DAILY[c]||[], last=b.length?b[b.length-1]:null;
      return c+':' + b.length + ':' + (last?last.date:'') + ':' + (last&&last.c!=null?last.c:'');
    });
    return [getFreq(),N_TREND,MOM_CONSISTENCY_MULT,CORR_WIN,parts.join('|')].join('::');
  }catch(e){ return null; }
}
async function saveScoreCacheToDB(sig){
  if(!sig||!CACHE_BUILT) return;
  try{
    var db=await initDB();
    var tx=db.transaction('stockData','readwrite');
    tx.objectStore('stockData').put({id:'score_cache_fast',sig:sig,RAW_SCORES:RAW_SCORES,CACHE_TS:CACHE_TS,ts:new Date().toISOString()});
  }catch(e){ console.warn('Score cache save failed',e); }
}
async function loadScoreCacheFromDB(sig){
  if(!sig) return false;
  try{
    var db=await initDB();
    var tx=db.transaction('stockData','readonly');
    var req=tx.objectStore('stockData').get('score_cache_fast');
    return await new Promise(function(resolve){
      req.onsuccess=function(){
        var r=req.result;
        if(r&&r.sig===sig&&r.RAW_SCORES){
          RAW_SCORES=r.RAW_SCORES||{};
          CACHE_BUILT=true; CACHE_TS=r.CACHE_TS||r.ts||new Date().toISOString(); CACHE_SIG=sig; CACHE_SKIP_MO=SKIP_MO;
          updCacheSt(); resolve(true);
        }else resolve(false);
      };
      req.onerror=function(){resolve(false);};
    });
  }catch(e){ return false; }
}
function clearRuntimeIndexes(){ PRICE_INDEX_CACHE={}; PRICE_DATE_CACHE={}; TN_DATE_CACHE={}; CORR_CACHE={}; }

function $(i){return document.getElementById(i);}
function gv(i){var e=$(i);return e?parseFloat(e.value)||0:0;}
function sl(id,msg,ok){var e=$(id);if(!e)return;e.textContent=msg;e.style.color=ok===true?'var(--gr)':ok===false?'var(--re)':'var(--mu)';}
function showL(t){$('loadEl').classList.remove('hidden');$('loadTxt').textContent=t||'...';}
function hideL(){$('loadEl').classList.add('hidden');}
function dlBlob(b,n){var a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=n;document.body.appendChild(a);a.click();document.body.removeChild(a);}
function dlText(t,n,ty){dlBlob(new Blob([t],{type:ty||'text/plain;charset=utf-8'}),n);}
function switchTab(name,el){var tabs=document.querySelectorAll('.tab'),panels=document.querySelectorAll('.panel');for(var i=0;i<tabs.length;i++)tabs[i].classList.remove('active');for(var i=0;i<panels.length;i++)panels[i].classList.remove('active');if(el)el.classList.add('active');var p=$('panel-'+name);if(p)p.classList.add('active');}
function toggleGroup(ibId,turnOn){var ib=$(ibId);if(!ib)return;ib.querySelectorAll('[data-code]').forEach(function(el){el.dataset.on=turnOn?'1':'0';turnOn?el.classList.add('act'):el.classList.remove('act');});updCountByIb(ib);}
function initGroupToggles(){document.querySelectorAll('.ih').forEach(function(ih){var ib=ih.nextElementSibling;if(!ib||!ib.classList.contains('ib'))return;var ibId=ib.id;if(!ibId)return;var wrap=document.createElement('span');wrap.style.cssText='display:inline-flex;align-items:center;gap:3px;margin-right:6px';var b1=document.createElement('button');b1.className='bo sm';b1.style.cssText='padding:1px 5px;font-size:10px;color:var(--gr);border-color:var(--gr)';b1.textContent='\u5168';b1.onclick=function(e){e.stopPropagation();toggleGroup(ibId,true);};var b2=document.createElement('button');b2.className='bo sm';b2.style.cssText='padding:1px 5px;font-size:10px;color:var(--re);border-color:var(--re)';b2.textContent='\u505c';b2.onclick=function(e){e.stopPropagation();toggleGroup(ibId,false);};wrap.appendChild(b1);wrap.appendChild(b2);var ic=ih.querySelector('.ic');ih.insertBefore(wrap,ic);});}
function toggleStock(code){var el=document.querySelector('[data-code="'+code+'"]');if(!el)return;var on=el.dataset.on==='1';el.dataset.on=on?'0':'1';el.classList.toggle('act',!on);updCount(el);}
function deleteStock(code){var el=document.querySelector('[data-code="'+code+'"]');if(!el||el.dataset.type==='tw50'||code==='SGOV')return;var ib=el.closest('.ib');el.remove();if(ib)updCountByIb(ib);}
function toggleInd(ih){var ib=ih.nextElementSibling;if(ib)ib.classList.toggle('col');}
function selectGroup(btn, turnOn) {
  var ib = btn.closest('.ig').querySelector('.ib');
  if (!ib) return;
  ib.querySelectorAll('[data-code]').forEach(function(el) {
    if (el.dataset.type === 'tw50') return; // 鎖定項目不動
    el.dataset.on = turnOn ? '1' : '0';
    turnOn ? el.classList.add('act') : el.classList.remove('act');
  });
  updAllCounts();
}
function selectAll(){document.querySelectorAll('[data-code]').forEach(function(el){el.dataset.on='1';el.classList.add('act');});updAllCounts();}
function selectNone(){document.querySelectorAll('[data-code]').forEach(function(el){el.dataset.on='0';el.classList.remove('act');});updAllCounts();}
function selectTW(turnOn){document.querySelectorAll('[data-code][data-tw="1"]').forEach(function(el){el.dataset.on=turnOn?'1':'0';turnOn?el.classList.add('act'):el.classList.remove('act');});updAllCounts();}
function selectIntl(turnOn){document.querySelectorAll('[data-code][data-tw="0"]').forEach(function(el){ if(el.dataset.region==='cn') return; el.dataset.on=turnOn?'1':'0';turnOn?el.classList.add('act'):el.classList.remove('act');});updAllCounts();}
function selectCN(turnOn){document.querySelectorAll('[data-code][data-region="cn"]').forEach(function(el){el.dataset.on=turnOn?'1':'0';turnOn?el.classList.add('act'):el.classList.remove('act');});updAllCounts();}
function updCount(chip){var ib=chip.closest('.ib');if(ib)updCountByIb(ib);}
function updCountByIb(ib){var all=ib.querySelectorAll('[data-code]'),act=ib.querySelectorAll('[data-on="1"]');var ih=ib.previousElementSibling;if(ih){var ic=ih.querySelector('.ic');if(ic)ic.textContent=act.length+'/'+all.length;}}
function updAllCounts(){document.querySelectorAll('.ib').forEach(function(ib){updCountByIb(ib);});}
function addCustom(){var raw=$('cusT').value.trim().toUpperCase();var isUS=$('cusUS')&&$('cusUS').checked;var code=isUS?raw:raw.replace('.TW','');if(!code)return;if(document.querySelector('[data-code="'+code+'"]'))return;var name=$('cusN').value.trim()||code;var chip=document.createElement('span');chip.className='sc act'+(isUS?' usc':'');chip.setAttribute('onclick',"toggleStock('"+code+"')");chip.dataset.code=code;chip.dataset.type='mid';chip.dataset.tw=isUS?'0':'1';var customInd=$('cusI')?$('cusI').value:(isUS?'US-Custom':'TW-Custom');chip.dataset.industry=customInd;chip.dataset.sector=customInd;chip.dataset.region=isUS?'us':'tw';chip.dataset.pool=isUS?'us':'tw';chip.dataset.on='1';chip.innerHTML='<span class="cc">'+code+'</span><span class="cn">'+name+'</span><span class="cd" onclick="event.stopPropagation();deleteStock(\''+code+'\')">x</span>';var ibs=document.querySelectorAll('.ib');if(ibs.length)ibs[0].appendChild(chip);$('cusT').value='';$('cusN').value='';updAllCounts();}
function getStockName(code){var el=document.querySelector('[data-code="'+code+'"] .cn');return el?el.textContent:code;}
function getWeightMode(){var r=document.querySelector('input[name="wtMode"]:checked');return r?r.value:'eq';}

function getIndustryKeyFromStock(s) {
  if (!s) return 'UNKNOWN';
  if (s.c === 'CASH') return 'CASH';
  if (s.c === 'SGOV') return 'SGOV';
  return (s.industry || s.ind || s.subInd || s.sector || s.pool || 'UNKNOWN').toString();
}
function getIndustryLimit() {
  var v = parseInt($('btIndLimit') ? $('btIndLimit').value : '0');
  return isFinite(v) && v > 0 ? v : 0;
}
function canPickByIndustry(cand, selected, limit) {
  if (!limit || limit <= 0 || !cand || !cand.s) return true;
  var code = cand.s.c;
  if (code === 'SGOV' || code === 'CASH' || cand.s.pool === 'etf') return true;
  var key = getIndustryKeyFromStock(cand.s);
  var count = 0;
  selected.forEach(function(x){
    if (!x || !x.s) return;
    if (x.s.c === 'SGOV' || x.s.c === 'CASH' || x.s.pool === 'etf') return;
    if (getIndustryKeyFromStock(x.s) === key) count++;
  });
  return count < limit;
}

function buildProxies() {
  var p = $('proxyUrl') ? $('proxyUrl').value.trim() : '';
  if (p && !p.includes('url=')) p += p.endsWith('/') ? '?url=' : '/?url=';
  return [p, 'https://api.allorigins.win/raw?url=', 'https://api.codetabs.com/v1/proxy?quest='].filter(Boolean);
}


// FETCH FAST MODE / LAZY CACHE
var FETCH_CFG = {
  concurrency: 6,          // 多點抓取並發數；過高容易被 Yahoo/proxy 限流
  failWaitMs: 1000,        // 原 fetchAll 失敗/每檔等待 2000ms，降 50%
  updateWaitMs: 175,       // 原 update 每檔 350ms，降 50%
  startDate: '1993-01-01', // Yahoo 有資料才會回；沒有則從上市日起算
  lazyCache: true          // 抓取/上傳/更新後不立刻 buildCache，等信號/回測前才建
};

function unixDateUTC(dateStr) {
  return Math.floor(new Date(dateStr + 'T00:00:00Z').getTime() / 1000);
}
function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
function resetDerivedViews(reason) {
  BT_RESULT = null;
  if (CHART.n) { try { CHART.n.destroy(); } catch(e){} CHART.n = null; }
  if (CHART.d) { try { CHART.d.destroy(); } catch(e){} CHART.d = null; }
  var btRes = $('btRes');
  if (btRes) btRes.classList.add('hidden');
  var btMetrics = $('btMetrics');
  if (btMetrics) btMetrics.innerHTML = '';
  var btBody = $('btBody');
  if (btBody) btBody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--mu);padding:12px;font-size:12px">資料已更新，請重新執行回測。</td></tr>';
  if ($('wfRes')) $('wfRes').classList.add('hidden');
  if ($('rollRes')) $('rollRes').classList.add('hidden');
  if ($('tnRes')) $('tnRes').classList.add('hidden');
  if (reason) console.log('[DERIVED RESET]', reason);
}
function markCacheDirty(reason) {
  CACHE_BUILT = false;
  CACHE_TS = null;
  CACHE_SIG = null;
  RAW_SCORES = {};
  clearRuntimeIndexes();
  resetDerivedViews(reason || 'data changed');
  updCacheSt();
  if (reason) console.log('[CACHE DIRTY]', reason);
}
async function ensureCacheBuilt(reason) {
  var sig=getCacheSignature();
  if (CACHE_BUILT && CACHE_SKIP_MO===SKIP_MO && (!sig || sig===CACHE_SIG)) return true;
  if (await loadScoreCacheFromDB(sig)) {
    sl('dlLog','Score cache restored for '+(reason||'calculation')+'.',true);
    return true;
  }
  sl('dlLog', 'Building cache for ' + (reason || 'calculation') + '...', null);
  await buildCache();
  CACHE_SIG=sig;
  await saveScoreCacheToDB(sig);
  await saveAllToDB();
  return CACHE_BUILT;
}
async function mapLimit(items, limit, worker) {
  var idx = 0, done = 0, results = [];
  limit = Math.max(1, Math.min(limit || 1, items.length || 1));
  async function runOne() {
    while (idx < items.length) {
      var my = idx++;
      results[my] = await worker(items[my], my);
      done++;
      if ($('fetchFill')) $('fetchFill').style.width = ((done / items.length) * 100) + '%';
      updFetchStat();
    }
  }
  var runners = [];
  for (var i = 0; i < limit; i++) runners.push(runOne());
  await Promise.all(runners);
  return results;
}

async function fp(url, proxies) {
  var last;
  for (var i = 0; i < proxies.length; i++) {
    try {
      var r = await fetch(proxies[i] + encodeURIComponent(url));
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r;
    } catch (e) { last = e; }
  }
  throw last || new Error('all proxies failed');
}

function buildTicker(s){if(!s.tw)return s.c;if(s.c.charAt(0)==='^'||s.c.indexOf('.')>=0)return s.c;return s.c+'.TW';}

async function fetchOHLCV(s, interval, range) {
  range = range || 'max';
  var tk = buildTicker(s);
  var proxies = buildProxies();
  var queryStr = 'range=' + range + '&interval=' + interval;
  if (range === 'max') {
    var nowUnix = Math.floor(Date.now() / 1000);
    queryStr = 'period1=' + unixDateUTC(FETCH_CFG.startDate) + '&period2=' + nowUnix + '&interval=' + interval;
  }
  var targetUrl = 'https://query1.finance.yahoo.com/v8/finance/chart/' + tk + '?' + queryStr;
  var r = await fp(targetUrl, proxies);
  var j = await r.json();
  var ch = j.chart && j.chart.result && j.chart.result[0];
  if (!ch || !ch.timestamp) throw new Error('No Data for ' + tk);
  return ch.timestamp.map(function(ts, i) {
    var q = ch.indicators.quote[0];
    var adj = ch.indicators.adjclose && ch.indicators.adjclose[0] && ch.indicators.adjclose[0].adjclose && ch.indicators.adjclose[0].adjclose[i];
    return {
      date: new Date(ts * 1000).toISOString().slice(0, 10),
      o: q.open[i], h: q.high[i], l: q.low[i],
      c: (adj !== undefined && adj !== null) ? adj : q.close[i],
      v: q.volume[i] || 0
    };
  }).filter(function(v){ return v.c != null; });
}

async function fetchAll() {
  var stocks = getEnabledStocks();
  if(!stocks.length) return alert('請先選擇股池');
  if (!confirm('重新抓取會以新抓到的資料覆蓋目前記憶體與 IndexedDB，避免混用舊資料。是否繼續？')) return;
  showL('多點抓取全歷史日線...');
  $('fetchProg').classList.remove('hidden');
  $('fetchFill').style.width = '0%';
  var success = 0, failed = [];
  var freshDaily = {};
  await mapLimit(stocks, FETCH_CFG.concurrency, async function(s, i) {
    $('loadTxt').textContent = '抓取: ' + s.c + ' (' + (i+1) + '/' + stocks.length + ')';
    try {
      var bars = await fetchOHLCV(s, '1d', 'max');
      if (!bars || !bars.length) throw new Error('empty bars');
      freshDaily[s.c] = bars;
      success++;
      return true;
    } catch(e) {
      failed.push(s.c);
      console.error(s.c, e);
      await sleep(FETCH_CFG.failWaitMs);
      return false;
    }
  });
  try {
    $('loadTxt').textContent = '同步大盤基準...(^TNX, ^TWII)';
    var bench = [{c:'^TNX', tw:false}, {c:'^TWII', tw:true}];
    await mapLimit(bench, 2, async function(bs) {
      try {
        var bars = await fetchOHLCV(bs, '1d', 'max');
        if (bars && bars.length) freshDaily[bs.c] = bars;
      } catch(e) { console.warn('Bench Fetch Error: ' + bs.c, e); }
      return true;
    });
  } catch(e) { console.error('Bench Fetch Error', e); }

  // 關鍵修正：完整重抓採用 freshDaily 整包替換，不再把失敗標的保留成舊資料。
  DAILY = freshDaily;
  hideL(); $('fetchProg').classList.add('hidden');
  updFetchStat(); updTNX();
  markCacheDirty('fetchAll:fresh-replace');
  await saveAllToDB();
  sl('dlLog', '重新抓取完成。成功:' + success + ' 失敗:' + failed.length + '。已用新資料整包覆蓋舊資料庫；回測結果已清空，下一次回測會用新資料重建 Cache。', failed.length === 0);
}

async function fetchUpdate() {
  var stocks = getEnabledStocks();
  var twCut = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  var usCut = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  var missing = [], stale = [];
  stocks.forEach(function(s) {
    if (!DAILY[s.c] || !DAILY[s.c].length) { missing.push(s); return; }
    if (DAILY[s.c][DAILY[s.c].length - 1].date < (s.tw ? twCut : usCut)) stale.push(s);
  });
  if (!missing.length && !stale.length) { sl('updateLog', '所有資料已是最新狀態。', true); return; }
  var toFetch = missing.concat(stale), failed = [];
  showL('多點智慧更新 ' + toFetch.length + ' 檔標的...');
  $('fetchProg').classList.remove('hidden');
  $('fetchFill').style.width = '0%';
  await mapLimit(toFetch, FETCH_CFG.concurrency, async function(s, i) {
    $('loadTxt').textContent = '[UPD] ' + s.c + ' (' + (i + 1) + '/' + toFetch.length + ')';
    try {
      var range = 'max';
      if (DAILY[s.c] && DAILY[s.c].length > 0) {
        var lastDate = new Date(DAILY[s.c][DAILY[s.c].length - 1].date);
        var delayDays = Math.floor((new Date() - lastDate) / (1000 * 60 * 60 * 24));
        if (delayDays <= 7) range = '5d';
        else if (delayDays <= 30) range = '1mo';
        else if (delayDays <= 90) range = '3mo';
        else if (delayDays <= 180) range = '6mo';
        else if (delayDays <= 365) range = '1y';
      }
      DAILY[s.c] = mergeArr(DAILY[s.c], await fetchOHLCV(s, '1d', range));
      await sleep(FETCH_CFG.updateWaitMs);
      return true;
    } catch (e) { failed.push(s.c); console.warn('Update failed: ' + s.c, e); await sleep(FETCH_CFG.updateWaitMs); return false; }
  });
  var benchList = [{c:'^TNX',tw:false},{c:'^TWII',tw:true}];
  await mapLimit(benchList, 2, async function(bs) {
    if (!DAILY[bs.c] || !DAILY[bs.c].length) return false;
    var lastBenchDate = DAILY[bs.c][DAILY[bs.c].length - 1].date;
    var benchCut = bs.tw ? twCut : usCut;
    if (lastBenchDate >= benchCut) return true;
    try {
      var bDelayDays = Math.floor((new Date() - new Date(lastBenchDate)) / (1000 * 60 * 60 * 24));
      var bRange = bDelayDays <= 7 ? '5d' : bDelayDays <= 30 ? '1mo' : bDelayDays <= 90 ? '3mo' : '6mo';
      DAILY[bs.c] = mergeArr(DAILY[bs.c], await fetchOHLCV(bs, '1d', bRange));
      return true;
    } catch (e) { console.warn('Bench update failed: ' + bs.c, e); return false; }
  });
  hideL(); $('fetchProg').classList.add('hidden'); updFetchStat();
  markCacheDirty('fetchUpdate');
  await saveAllToDB();
  sl('updateLog', '更新完成。新增:' + missing.length + ' 續接:' + stale.length + ' 失敗:' + failed.length + '。Cache 延後到信號/回測前自動重建。', failed.length === 0);
}

function updTNX(){
  var bars = DAILY['^TNX'];
  if(!bars || !bars.length) return;
  var last = bars[bars.length-1];
  var sp = gv('btSpread')||0.5;
  var el = $('tnxVal'); if(el) el.textContent = last.c.toFixed(2)+'% ('+last.date+')';
  var el2 = $('tnxThresh'); if(el2) el2.textContent = 'TS: '+(last.c+sp).toFixed(2)+'%';
}

function updFetchStat(){
  var bar=$('fetchStat');if(!bar)return;var stocks=getEnabledStocks();
  bar.innerHTML=stocks.map(function(s){
    var ok=(DAILY[s.c]&&DAILY[s.c].length>0);
    var col=ok?(s.tw?'var(--te)':'var(--us)'):'var(--mu)', bg=ok?(s.tw?'var(--ted)':'var(--usd)'):'var(--sf2)', bd=ok?(s.tw?'var(--te)':'var(--us)'):'var(--bd)';
    return '<span class="bdg" style="background:'+bg+';color:'+col+';border:1px solid '+bd+'">'+s.c+'</span>';
  }).join('');
}

function calcVolatility(bars, win) {
  if (!bars || bars.length < win) return null;
  var rets = [];
  for (var j = bars.length - win + 1; j < bars.length; j++) {
    if (bars[j-1] && bars[j].c > 0 && bars[j-1].c > 0) {
      rets.push(bars[j].c / bars[j-1].c - 1);
    }
  }
  if (rets.length < 10) return null;
  var mean = rets.reduce(function(a, b){ return a + b; }, 0) / rets.length;
  var variance = rets.reduce(function(a, b){ return a + Math.pow(b - mean, 2); }, 0) / (rets.length > 1 ? rets.length - 1 : 1);
  return Math.sqrt(variance * 252);
}

// FIX2: calcMA renamed to calcSimpleMA (pure simple MA, no volume weighting)
function calcSimpleMA(bars, dateStr, period) {
  if (!bars || !bars.length) return null;
  var idx = -1;
  for (var i = bars.length - 1; i >= 0; i--) {
    if (bars[i].date <= dateStr) { idx = i; break; }
  }
  if (idx < period - 1) return null;
  var sum = 0;
  for (var i = idx - period + 1; i <= idx; i++) {
    sum += bars[i].c;
  }
  return sum / period;
}

function getBarsKey(bars){
  if(!bars||!bars.length) return 'empty';
  return (bars._cacheKey||(bars._cacheKey=(bars[0].date+'|'+bars.length+'|'+bars[bars.length-1].date)));
}
function findBarIndexLE(bars, dateStr) {
  if (!bars || !bars.length || !dateStr || dateStr < bars[0].date) return -1;
  var key=getBarsKey(bars)+'|'+dateStr;
  if (PRICE_INDEX_CACHE[key] !== undefined) return PRICE_INDEX_CACHE[key];
  var lo=0, hi=bars.length-1, ans=-1;
  while(lo<=hi){
    var mid=(lo+hi)>>1;
    if(bars[mid].date<=dateStr){ ans=mid; lo=mid+1; } else hi=mid-1;
  }
  PRICE_INDEX_CACHE[key]=ans;
  return ans;
}
function getPriceOnDate(bars, dateStr) {
  var idx=findBarIndexLE(bars,dateStr);
  return idx>=0 ? bars[idx].c : null;
}
function getMarketMonthEndPoint(code, refDate) {
  var bars = DAILY[code];
  if (!bars || !bars.length || !refDate) return null;
  var ym = refDate.slice(0, 7), key=code+'|mep|'+refDate;
  if (PRICE_DATE_CACHE[key]) return PRICE_DATE_CACHE[key];
  var idx=findBarIndexLE(bars, refDate);
  for (var i=idx; i>=0; i--) {
    if (bars[i].date.slice(0,7) !== ym) break;
    if (bars[i].c != null) return (PRICE_DATE_CACHE[key]={date:bars[i].date, price:bars[i].c});
  }
  for (var j=idx; j>=0; j--) if (bars[j].c != null) return (PRICE_DATE_CACHE[key]={date:bars[j].date, price:bars[j].c, fallback:true});
  return null;
}
function getRefMonthEndDate(refDaily, refDate) {
  if (!refDaily || !refDaily.length || !refDate) return refDate;
  var ym=refDate.slice(0,7), idx=findBarIndexLE(refDaily, ym+'-31');
  for(var i=idx;i>=0;i--){ if(refDaily[i].date.slice(0,7)===ym) return refDaily[i].date; if(refDaily[i].date.slice(0,7)<ym) break; }
  return refDate;
}
function getTNExecMode() {
  var sigPanel=$('panel-signal');
  var useSignal=sigPanel && sigPanel.classList && sigPanel.classList.contains('active');
  var e = useSignal ? ($('tnExecMode') || $('btTNExecMode')) : ($('btTNExecMode') || $('tnExecMode'));
  return e ? e.value : 'T';
}
function getTNExecutionDate(refDaily, monthEndDate, signalN, execMode) {
  if (!monthEndDate) return null;
  if (execMode === 'NEXT' && signalN !== undefined && signalN !== null) {
    var n=Math.max(0,(parseInt(signalN,10)||0)-1);
    return getFixedTNDate(refDaily, monthEndDate, n) || monthEndDate;
  }
  return monthEndDate;
}
function describeTNExecMode(execMode,n){
  if(execMode==='NEXT') return '訊號=T-'+n+'；交易=T-('+Math.max(0,n-1)+')收盤→下期同基準';
  return '訊號=T-'+n+'；交易=T月底→下期T月底';
}
function getLatestMarketPoint(code) {
  var bars=DAILY[code]; if(!bars||!bars.length) return null;
  for(var i=bars.length-1;i>=0;i--) if(bars[i].c!=null) return {date:bars[i].date,price:bars[i].c};
  return null;
}
function fmtPx(v){ if(v===null||v===undefined||!isFinite(v)) return '--'; return Math.abs(v)>=1000?v.toFixed(0):(Math.abs(v)>=100?v.toFixed(1):v.toFixed(2)); }
function fmtRet(v){ if(v===null||v===undefined||!isFinite(v)) return '--'; return (v>=0?'+':'')+(v*100).toFixed(2)+'%'; }
function calcLivePositionReturn(entryPrice, latestPrice, weight){ if(!entryPrice||!latestPrice||entryPrice<=0) return null; var raw=latestPrice/entryPrice-1; return weight<0?-raw:raw; }
function renderLatestHoldingsPriceBox(record) {
  if(!record||!record.stockRets) return '';
  var rows=[];
  Object.keys(record.stockRets).forEach(function(k){
    if(k==='CASH') return;
    var sr=record.stockRets[k]||{}, w=(sr.w!==undefined?sr.w:(record.holdings?record.holdings[k]:0))||0;
    var entryPrice=sr.prevAdjPrice||sr.prevPrice, entryDate=sr.prevME_Date||sr.prevDate||record.tradeStart||record.period||record.month;
    var latest=getLatestMarketPoint(k), latestPrice=latest?latest.price:null, liveRet=calcLivePositionReturn(entryPrice,latestPrice,w);
    var side=w<0?'SHORT':'LONG', sideColor=w<0?'var(--re)':'var(--gr)', retColor=liveRet===null?'var(--mu)':(liveRet>=0?'var(--gr)':'var(--re)');
    rows.push('<tr><td class="mono" style="color:var(--wh);font-weight:700">'+k+'</td><td>'+getStockName(k)+'</td><td class="mono" style="color:'+sideColor+'">'+side+'</td><td class="mono">'+Math.abs(w*100).toFixed(1)+'%</td><td class="mono">'+(entryDate||'--')+'</td><td class="mono" style="color:var(--tw)">'+fmtPx(entryPrice)+'</td><td class="mono">'+(latest?latest.date:'--')+'</td><td class="mono" style="color:var(--ac)">'+fmtPx(latestPrice)+'</td><td class="mono" style="color:'+retColor+';font-weight:700">'+fmtRet(liveRet)+'</td></tr>');
  });
  if(!rows.length) return '';
  return '<div class="card" style="border-top:3px solid var(--ac);margin-top:8px"><div class="ct">最新一個月持股價格追蹤 <span style="font-size:10px;color:var(--mu);font-weight:400">買入價=目前選擇的T-N成交基準；最新市價=資料庫最後收盤價</span></div><div class="tw-wrap" style="max-height:none;margin-bottom:0"><table><thead><tr><th>Code</th><th>Name</th><th>Side</th><th>Weight</th><th>買入日</th><th>買入價</th><th>最新日</th><th>最新市價</th><th>即時損益%</th></tr></thead><tbody>'+rows.join('')+'</tbody></table></div></div>';
}
function renderSignalPriceLine(code, scoreDate, weightSign, sigN) {
  var refDaily=DAILY['^TWII']||DAILY['0050']||DAILY['SPY']||DAILY[code];
  var monthEnd=getRefMonthEndDate(refDaily,scoreDate), execMode=getTNExecMode(), entryDate=getTNExecutionDate(refDaily,monthEnd,sigN,execMode);
  var entry=getMarketMonthEndPoint(code,entryDate), latest=getLatestMarketPoint(code), liveRet=calcLivePositionReturn(entry?entry.price:null,latest?latest.price:null,weightSign||1);
  var retColor=liveRet===null?'var(--mu)':(liveRet>=0?'var(--gr)':'var(--re)');
  var modeLabel=execMode==='NEXT'?('買入=T-('+Math.max(0,(parseInt(sigN,10)||0)-1)+')'):'買入=T';
  return '<div style="margin-top:5px;padding-top:5px;border-top:1px dashed var(--bd);font-size:10px;color:var(--mu);font-family:monospace;line-height:1.7"><div>'+modeLabel+' | 買入日: <span style="color:var(--tw)">'+(entry?entry.date:'--')+'</span> | 買入價: <span style="color:var(--tw)">'+fmtPx(entry?entry.price:null)+'</span></div><div>最新日: <span style="color:var(--ac)">'+(latest?latest.date:'--')+'</span> | 最新市價: <span style="color:var(--ac)">'+fmtPx(latest?latest.price:null)+'</span> | 即時損益: <span style="color:'+retColor+';font-weight:700">'+fmtRet(liveRet)+'</span></div></div>';
}

function getPrevWorkDay(bars, dateStr, offset) {
  offset = offset || 1;
  if (!bars || !bars.length) return dateStr;
  var targetIdx = -1;
  for (var i = bars.length - 1; i >= 0; i--) {
    if (bars[i].date <= dateStr) { targetIdx = i; break; }
  }
  if (targetIdx === -1) return bars[0].date;
  if (targetIdx < offset) return bars[0].date;
  return bars[targetIdx - offset].date;
}

// FIX2: all calcMA calls updated to calcSimpleMA
function isBearishRegime(bars, dateStr, period) {
  period = period || 60;
  var ma = calcSimpleMA(bars, dateStr, period), price = getPriceOnDate(bars, dateStr);
  if (!ma || !price) return false;
  var prevDate = getPrevWorkDay(bars, dateStr, 5), prevMA = calcSimpleMA(bars, prevDate, period);
  return price < ma && (prevMA ? ma < prevMA : true);
}

function getFreq(){
  var radio=document.querySelector('input[name="btFreq"]:checked');
  if (radio) return radio.value || "1";
  var sel=$('btFreq');
  return sel ? (sel.value || "1") : "1";
}
function getAnnualPeriods(){
  return getFreq()==="2" ? 24 : 12;
}

function getMonthBarsMap(bars) {
  var map = {};
  if (!bars) return map;
  bars.forEach(function(bar) {
    var ym = bar.date.slice(0, 7);
    if (!map[ym]) map[ym] = [];
    map[ym].push(bar);
  });
  return map;
}

function getFixedTNDate(bars, monthEndDate, n) {
  n = Math.max(0, parseInt(n || 0));
  if (!bars || !bars.length || !monthEndDate) return monthEndDate;
  var key=getBarsKey(bars)+'|TN|'+monthEndDate+'|'+n;
  if(TN_DATE_CACHE[key]) return TN_DATE_CACHE[key];
  var ym=monthEndDate.slice(0,7), idx=findBarIndexLE(bars, monthEndDate), m=[];
  for(var i=idx;i>=0;i--){
    if(bars[i].date.slice(0,7)!==ym) break;
    m.push(bars[i].date);
  }
  if(!m.length) return monthEndDate;
  var out=m[Math.min(n,m.length-1)];
  TN_DATE_CACHE[key]=out;
  return out;
}

function getCurrentYM() {
  var d = new Date();
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  return y + '-' + m;
}

function hasLaterMonth(bars, ym) {
  if (!bars || !bars.length || !ym) return false;
  for (var i = 0; i < bars.length; i++) {
    if (bars[i].date && bars[i].date.slice(0, 7) > ym) return true;
  }
  return false;
}

function pad2(n){ return String(n).padStart(2, '0'); }
function getMonthLastCalendarDate(ym){
  var y=parseInt(ym.slice(0,4),10), m=parseInt(ym.slice(5,7),10);
  return new Date(y, m, 0);
}
function fmtDateObj(d){ return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate()); }
function getWeekdayDatesInMonth(ym){
  var y=parseInt(ym.slice(0,4),10), m=parseInt(ym.slice(5,7),10)-1;
  var end=getMonthLastCalendarDate(ym).getDate();
  var out=[];
  for(var d=1; d<=end; d++){
    var dt=new Date(y,m,d), wd=dt.getDay();
    if(wd!==0 && wd!==6) out.push(fmtDateObj(dt));
  }
  return out;
}
function getActualMonthEndDate(bars, ym){
  if(!bars || !bars.length || !ym) return null;
  var last=null;
  for(var i=0;i<bars.length;i++){
    if(bars[i].date && bars[i].date.slice(0,7)===ym) last=bars[i].date;
  }
  return last;
}
function getActualOrPrevTradingDay(bars, dateStr){
  if(!bars || !bars.length || !dateStr) return dateStr;
  var ans=null;
  for(var i=0;i<bars.length;i++){
    if(bars[i].date <= dateStr) ans=bars[i].date;
    else break;
  }
  return ans || dateStr;
}
function getSignalTNInfo(bars){
  if(!bars || !bars.length) return null;
  var inputYM = $('sigYM') ? ($('sigYM').value || '').trim().slice(0,7) : '';
  var lastDate = bars[bars.length-1].date;
  var ym = inputYM || lastDate.slice(0,7);
  if(!/^\d{4}-\d{2}$/.test(ym)) return null;
  var n = Math.max(0, Math.min(22, parseInt($('sigTN') ? $('sigTN').value : '10') || 0));
  var actualMonthEnd = getActualMonthEndDate(bars, ym);
  var isComplete = hasLaterMonth(bars, ym);
  var T, tN, source;
  if(isComplete){
    T = actualMonthEnd;
    tN = getFixedTNDate(bars, T, n);
    source = 'actual';
  } else {
    var weekdays = getWeekdayDatesInMonth(ym);
    if(!weekdays.length) return null;
    T = weekdays[weekdays.length-1];
    var idx = weekdays.length - 1 - n;
    if(idx < 0) idx = 0;
    tN = weekdays[idx];
    source = 'estimated';
  }
  var ready = lastDate >= tN;
  var scoreDate = ready ? getActualOrPrevTradingDay(bars, tN) : null;
  return {ym:ym, N:n, T:T, tN:tN, scoreDate:scoreDate, ready:ready, lastDate:lastDate, source:source};
}
function getSignalMonthEnd(bars) {
  var info = getSignalTNInfo(bars);
  return info ? info.T : null;
}

function buildScoreCacheForDate(dateStr){
  if(!dateStr) return;
  var stocks=getEnabledStocks();
  stocks.forEach(function(s){
    var bars=DAILY[s.c];
    if(!bars || !bars.length) return;
    if(!RAW_SCORES[s.c]) RAW_SCORES[s.c]={};
    if(RAW_SCORES[s.c][dateStr]) return;
    var bIdx=-1;
    for(var i=0;i<bars.length;i++){
      if(bars[i].date <= dateStr) bIdx=i;
      else break;
    }
    if(bIdx >= 240){
      var cut=bars.slice(0,bIdx+1);
      RAW_SCORES[s.c][dateStr]={
        rm: rawMom(bars,bIdx),
        rb: calcBias(cut,N_TREND),
        rs: calcSlope(cut,N_TREND),
        rv: calcVol(cut,N_TREND),
        rk: calcKbar(cut,N_TREND),
        r240: bars[bIdx].c/(bars[bIdx-240]?bars[bIdx-240].c:1)-1
      };
    }
  });
}

function getPreciseRebalanceDates(bars, freq) {
  var dates = [];
  var currentMonth = "";
  var monthBars = [];
  function processMonth(mBars) {
    if(!mBars.length) return;
    if (freq === "2") {
      var midBar = mBars.filter(function(b){ return parseInt(b.date.slice(8,10)) >= 15; })[0];
      if (midBar) dates.push(midBar.date);
    }
    // 正式回測的月頻基準：每月最後一個可用交易日。
    dates.push(mBars[mBars.length - 1].date);
  }
  bars.forEach(function(bar) {
    var ym = bar.date.slice(0, 7);
    if (ym !== currentMonth) {
      if (currentMonth !== "") processMonth(monthBars);
      currentMonth = ym;
      monthBars = [];
    }
    monthBars.push(bar);
  });
  if (monthBars.length > 0) processMonth(monthBars);
  var seen = {}; var out = [];
  dates.forEach(function(d){ if(!seen[d]){ seen[d]=1; out.push(d); } });
  return out.sort();
}

function mergeArr(oldBars, newBars) {
  if (!oldBars || !oldBars.length) return newBars || [];
  if (!newBars || !newBars.length) return oldBars || [];
  var seen = {};
  oldBars.forEach(function(b){ seen[b.date] = b; });
  newBars.forEach(function(b){ seen[b.date] = b; });
  return Object.values(seen).sort(function(a, b){ return a.date.localeCompare(b.date); });
}

function calcVWMA(bars,n){if(bars.length<n)return null;var sl=bars.slice(-n),sp=0,sv=0;sl.forEach(function(b){var vol=b.v>0?b.v:1;sp+=b.c*vol;sv+=vol;});return sv>0?sp/sv:null;}
function calcBias(bars,N){var v=calcVWMA(bars,N);return v?(bars[bars.length-1].c-v)/v:null;}
function calcSlope(bars,N){if(bars.length<N+3)return null;var va=[];for(var i=bars.length-N;i<bars.length;i++){var sl=bars.slice(Math.max(0,i-N+1),i+1);var sp=0,sv=0;sl.forEach(function(b){var vol=b.v>0?b.v:1;sp+=b.c*vol;sv+=vol;});if(sv>0)va.push(sp/sv);}if(va.length<Math.floor(N/2))return null;var n=va.length,sx=0,sy=0,sxy=0,sx2=0;for(var j=0;j<n;j++){sx+=j;sy+=va[j];sxy+=j*va[j];sx2+=j*j;}var den=n*sx2-sx*sx;if(!den)return 0;return (n*sxy-sx*sy)/den/(va[0]||1);}
function calcVol(bars,N){if(bars.length<N+1)return null;var sl=bars.slice(-N),sc=[];for(var i=1;i<sl.length;i++){var pr=(sl[i].c-sl[i-1].c)/(sl[i-1].c||1);var vr=sl[i-1].v>0?sl[i].v/sl[i-1].v:1;sc.push((pr>=0?1:-1)*(pr>=0?(vr-1):(1-vr)));}return sc.length?sc.reduce(function(a,b){return a+b;},0)/sc.length:null;}
function calcKbar(bars,N){if(bars.length<N)return null;var sl=bars.slice(-N);var v=sl.map(function(b){var r=b.h-b.l;return r>0?(b.c-b.l)/r:0.5;});return v.reduce(function(a,b){return a+b;},0)/v.length;}

function momZ(bars, idx, period) {
  if (idx < period) return null;
  var ret = bars[idx].c / bars[idx - period].c - 1;
  var rets = [], start = Math.max(period, idx - 250);
  for (var i = start; i <= idx; i++) rets.push(bars[i].c / bars[i - period].c - 1);
  var mean = rets.reduce(function(a, b){ return a + b; }, 0) / rets.length;
  var std = Math.sqrt(rets.reduce(function(a, b){ return a + Math.pow(b - mean, 2); }, 0) / (rets.length > 1 ? rets.length - 1 : 1)) || 0.01;
  return (ret - mean) / std;
}

function rawMom(daily, idx) {
  if (idx < 240) return null;
  var z240 = momZ(daily, idx, 240), z120 = momZ(daily, idx, 120), z60 = momZ(daily, idx, 60);
  if (z240 === null || z120 === null || z60 === null) return null;
  var score = 0.5 * z240 + 0.3 * z120 + 0.2 * z60;
  if (z240 > 0 && z120 > 0 && z60 > 0) score *= MOM_CONSISTENCY_MULT;
  return score;
}

async function buildCache() {
  var stocks = getEnabledStocks();
  var withData = stocks.filter(function(s){ return DAILY[s.c] && DAILY[s.c].length > 0; });
  if(!withData.length){ updCacheSt(); return; }
  showL('Building V1.9 Cache...');
  RAW_SCORES = {};
  var freq = getFreq();
  var masterTicker = DAILY['^TWII'] ? '^TWII' : (DAILY['0050'] ? '0050' : (DAILY['SPY'] ? 'SPY' : withData[0].c));
  var refDaily = DAILY[masterTicker];
  var globalRebalDates = getPreciseRebalanceDates(refDaily, freq);
  var monthlyDates = getPreciseRebalanceDates(refDaily, "1");
  var neededDates = [];
  function addNeededDate(d) {
    if (d) neededDates.push(d);
  }
  // 回測正式使用月頻/半月頻；信號頁會獨立觀察固定 T-N，因此預建每月 T0~T22。
  globalRebalDates.forEach(function(d) {
    addNeededDate(d);
    addNeededDate(getPrevWorkDay(refDaily, d, 1));
    addNeededDate(getPrevWorkDay(refDaily, d, 2));
  });
  monthlyDates.forEach(function(d) {
    for (var k = 0; k <= 22; k++) addNeededDate(getFixedTNDate(refDaily, d, k));
  });
  var seen2 = {}; var cacheDates = [];
  neededDates.forEach(function(d){ if(!seen2[d]){ seen2[d]=1; cacheDates.push(d); } });
  cacheDates.sort();
  for(var si=0; si<withData.length; si++){
    var s=withData[si];
    $('loadTxt').textContent='Cache: '+s.c+' ('+(si+1)+'/'+withData.length+')';
    var bars=DAILY[s.c];
    RAW_SCORES[s.c]={};
    var bIdx=0;
    cacheDates.forEach(function(d){
      while(bIdx < bars.length - 1 && bars[bIdx + 1].date <= d) { bIdx++; }
      if(bars[bIdx].date <= d && bIdx >= 240){
        var cut = bars.slice(0, bIdx+1);
        RAW_SCORES[s.c][d]={
          rm: rawMom(bars, bIdx),
          rb: calcBias(cut, N_TREND),
          rs: calcSlope(cut, N_TREND),
          rv: calcVol(cut, N_TREND),
          rk: calcKbar(cut, N_TREND),
          r240: bars[bIdx].c/(bars[bIdx-240]?bars[bIdx-240].c:1)-1
        };
      }
    });
    if(si%5===4) await new Promise(function(r){ setTimeout(r,0); });
  }
  CACHE_BUILT=true; CACHE_TS=new Date().toISOString(); CACHE_SKIP_MO=SKIP_MO; CACHE_SIG=getCacheSignature();
  hideL(); updCacheSt(); updTNX();
}

function updCacheSt(){var el=$('cacheTxt');if(!el)return;if(!CACHE_BUILT){el.textContent='Cache: not built';el.style.color='var(--mu)';return;}var n=Object.keys(RAW_SCORES).length;var dt=new Date(CACHE_TS).toLocaleTimeString('en',{hour:'2-digit',minute:'2-digit'});el.textContent='Cache OK ('+n+' stocks, '+dt+')';el.style.color='var(--gr)';}

function crossZ(arr,cap){
  cap=cap||2;
  var vals=arr.filter(function(v){return v!==null&&!isNaN(v);});
  if(vals.length<3)return arr.map(function(v){return v===null?null:0;});
  var mean=vals.reduce(function(a,b){return a+b;},0)/vals.length;
  var std=Math.sqrt(vals.reduce(function(a,b){return a+(b-mean)*(b-mean);},0)/(vals.length>1?vals.length-1:1))||1;
  return arr.map(function(v){if(v===null)return null;return Math.max(-cap,Math.min(cap,(v-mean)/std));});
}

function getTNXRate(dateStr) {
  var rate = getPriceOnDate(DAILY['^TNX'], dateStr);
  return rate ? (rate / 100) : 0.04;
}

function getHurdle(dateStr){ return Math.max(0, getTNXRate(dateStr) + (gv('btSpread')||0.5)/100); }

// FIX2: calcMA -> calcSimpleMA
function isStrictTechnicalPass(code, dateStr) {
  var bars = DAILY[code];
  if (!bars || bars.length < 65) return false;
  var ma60 = calcSimpleMA(bars, dateStr, 60);
  var price = getPriceOnDate(bars, dateStr);
  var prevDate = getPrevWorkDay(bars, dateStr, 5);
  var prevMa60 = calcSimpleMA(bars, prevDate, 60);
  if (!ma60 || !price || !prevMa60) return false;
  return (price > ma60 && ma60 >= prevMa60);
}

function calcAllScores(dateStr) {
  var stocks = getEnabledStocks().filter(function(s){ return RAW_SCORES[s.c] && RAW_SCORES[s.c][dateStr]; });
  if (stocks.length < 3) return [];
  var mode = document.getElementById('poolMode').value;
  var w = {m:gv('wMom')/100, b:gv('wBias')/100, s:gv('wSlope')/100, v:gv('wVol')/100, k:gv('wKbar')/100};
  if (mode === 'large') {
    var rMs=[],rBs=[],rSs=[],rVs=[],rKs=[];
    var infos = stocks.map(function(s) {
      var r = RAW_SCORES[s.c][dateStr];
      rMs.push(r.rm); rBs.push(r.rb); rSs.push(r.rs); rVs.push(r.rv); rKs.push(r.rk);
      return {s:s, raw:r};
    });
    var zMs=crossZ(rMs,99),zBs=crossZ(rBs,2),zSs=crossZ(rSs,99),zVs=crossZ(rVs,2),zKs=crossZ(rKs,99);
    return infos.map(function(d,i){ return {s:d.s, score:(w.m*zMs[i]+w.b*zBs[i]+w.s*zSs[i]+w.v*zVs[i]+w.k*zKs[i]), zm:zMs[i],zb:zBs[i],zs:zSs[i],zv:zVs[i],zk:zKs[i],r240:d.raw.r240}; });
  } else {
    var poolGroups={'tw':[],'us':[],'etf':[],'other':[]};
    stocks.forEach(function(s){ if(poolGroups[s.pool]) poolGroups[s.pool].push(s); });
    var finalScores=[];
    Object.keys(poolGroups).forEach(function(p){
      var pStocks=poolGroups[p]; if(!pStocks.length) return;
      var rMs=[],rBs=[],rSs=[],rVs=[],rKs=[];
      var pinfos=pStocks.map(function(s){
        var r=RAW_SCORES[s.c][dateStr];
        rMs.push(r.rm);rBs.push(r.rb);rSs.push(r.rs);rVs.push(r.rv);rKs.push(r.rk);
        return {s:s,raw:r};
      });
      var zMs=crossZ(rMs,99),zBs=crossZ(rBs,2),zSs=crossZ(rSs,99),zVs=crossZ(rVs,2),zKs=crossZ(rKs,99);
      pinfos.forEach(function(d,i){
        finalScores.push({s:d.s, score:(w.m*zMs[i]+w.b*zBs[i]+w.s*zSs[i]+w.v*zVs[i]+w.k*zKs[i]), zm:zMs[i],zb:zBs[i],zs:zSs[i],zv:zVs[i],zk:zKs[i],r240:d.raw.r240});
      });
    });
    return finalScores;
  }
}

function calcCorr(c1, c2, dateStr) {
  var pair = c1 < c2 ? (c1+'|'+c2) : (c2+'|'+c1);
  var cacheKey = pair+'|'+dateStr+'|'+CORR_WIN;
  if (CORR_CACHE[cacheKey] !== undefined) return CORR_CACHE[cacheKey];
  var b1 = DAILY[c1], b2 = DAILY[c2];
  if (!b1 || !b2) return (CORR_CACHE[cacheKey]=0);
  function monthEndPrices(bars) {
    var map = {};
    bars.forEach(function(b){
      if (b.date > dateStr) return;
      var ym = b.date.slice(0,7);
      map[ym] = b;
    });
    return map;
  }
  var m1 = monthEndPrices(b1), m2 = monthEndPrices(b2);
  var months = Object.keys(m1).filter(function(m){ return m2[m]; }).sort();
  if (months.length < CORR_WIN + 1) return (CORR_CACHE[cacheKey]=0);
  months = months.slice(-(CORR_WIN + 1));
  var r1=[], r2=[];
  for (var i=1; i<months.length; i++) {
    var a=months[i-1], b=months[i];
    var p10=m1[a].c, p11=m1[b].c, p20=m2[a].c, p21=m2[b].c;
    if (!p10 || !p20) continue;
    r1.push(p11/p10-1);
    r2.push(p21/p20-1);
  }
  if (r1.length < Math.max(6, Math.min(12, CORR_WIN/2))) return (CORR_CACHE[cacheKey]=0);
  var avg1=r1.reduce(function(a,b){return a+b;},0)/r1.length;
  var avg2=r2.reduce(function(a,b){return a+b;},0)/r2.length;
  var num=0, d1=0, d2=0;
  for (var j=0; j<r1.length; j++) {
    num+=(r1[j]-avg1)*(r2[j]-avg2);
    d1+=Math.pow(r1[j]-avg1,2);
    d2+=Math.pow(r2[j]-avg2,2);
  }
  var denom=Math.sqrt(d1*d2);
  var corrVal = denom===0 ? 0 : num/denom;
  CORR_CACHE[cacheKey]=corrVal;
  return corrVal;
}

function getBench(dateStr) {
  var masterTicker = DAILY['^TWII'] ? '^TWII' : (DAILY['SPY'] ? 'SPY' : null);
  return masterTicker ? getPriceOnDate(DAILY[masterTicker], dateStr) : null;
}

function getShieldRefBars(){
  if (DAILY['SPY'] && DAILY['SPY'].length) return {code:'SPY', bars:DAILY['SPY']};
  if (DAILY['^TWII'] && DAILY['^TWII'].length) return {code:'^TWII', bars:DAILY['^TWII']};
  return null;
}

function getShieldMA(bars, dateStr, len){
  if (!bars || !bars.length) return null;
  var vals=[];
  for (var i=0; i<bars.length; i++) {
    if (bars[i].date <= dateStr && bars[i].c != null) vals.push(bars[i].c);
    if (bars[i].date > dateStr) break;
  }
  if (vals.length < len) return null;
  vals = vals.slice(-len);
  return vals.reduce(function(a,b){return a+b;},0) / vals.length;
}

function getShieldDecision(dateStr){
  var on = $('btShieldGate') && $('btShieldGate').value === 'on';
  if (!on) return {enabled:false, ok:true, reason:'OFF'};
  var ref = getShieldRefBars();
  if (!ref) return {enabled:true, ok:true, reason:'No ref data'};
  var maLen = parseInt($('btShieldMA') ? $('btShieldMA').value : '240') || 240;
  var price = getPriceOnDate(ref.bars, dateStr);
  var ma = getShieldMA(ref.bars, dateStr, maLen);
  if (!price || !ma) return {enabled:true, ok:true, reason:'Insufficient shield data', ref:ref.code};
  return {enabled:true, ok:price >= ma, price:price, ma:ma, ref:ref.code, reason:(price >= ma ? 'PASS' : 'FAIL')};
}


// FINAL AUDIT HELPERS: market-specific month-end pricing + traceable reconciliation
function monthKeyFromDate(dateStr) {
  return (dateStr || '').slice(0, 7);
}
function getMonthEndPoint(bars, ym) {
  if (!bars || !bars.length || !ym) return null;
  var last = null;
  for (var i = 0; i < bars.length; i++) {
    var b = bars[i];
    if (!b || !b.date) continue;
    if (b.date.slice(0, 7) === ym && b.c !== null && b.c !== undefined && isFinite(b.c)) last = b;
    if (last && b.date.slice(0, 7) > ym) break;
  }
  return last ? {date:last.date, price:last.c} : null;
}
function getAuditReturnPoint(code, prevDate, currDate) {
  var bars = DAILY[code];
  if (!bars || !bars.length) return {ret:null, prevME_Date:'', currME_Date:'', prevAdjPrice:null, currAdjPrice:null, method:'MISSING', note:'No DAILY data', flag:'MISSING_DATA'};
  var freq = getFreq ? getFreq() : '1';
  if (freq === '1') {
    var p0 = getMarketMonthEndPoint(code, prevDate);
    var p1 = getMarketMonthEndPoint(code, currDate);
    if (!p0 || !p1 || !p0.price || p0.price <= 0) {
      return {ret:null, prevME_Date:p0?p0.date:'', currME_Date:p1?p1.date:'', prevAdjPrice:p0?p0.price:null, currAdjPrice:p1?p1.price:null, method:'MARKET_EXEC_DATE', note:'Missing prev or curr execution-date price', flag:'MISSING_PRICE'};
    }
    var ret = p1.price / p0.price - 1;
    var flag = Math.abs(ret) > 0.30 ? 'LARGE_SINGLE_NAME_RETURN' : '';
    return {ret:ret, prevME_Date:p0.date, currME_Date:p1.date, prevAdjPrice:p0.price, currAdjPrice:p1.price, method:(p0.fallback||p1.fallback?'MARKET_EXEC_DATE_FALLBACK':'MARKET_EXEC_DATE'), note:(p0.fallback||p1.fallback?'Fallback date used':''), flag:flag};
  }
  var gp0 = getPriceOnDate(bars, prevDate), gp1 = getPriceOnDate(bars, currDate);
  if (!gp0 || !gp1 || gp0 <= 0) return {ret:null, prevME_Date:prevDate, currME_Date:currDate, prevAdjPrice:gp0, currAdjPrice:gp1, method:'GLOBAL_DATE_FALLBACK', note:'Missing price on global period date', flag:'MISSING_PRICE'};
  return {ret:gp1/gp0-1, prevME_Date:prevDate, currME_Date:currDate, prevAdjPrice:gp0, currAdjPrice:gp1, method:'GLOBAL_DATE_FALLBACK', note:'Half-month frequency uses global period dates', flag:(Math.abs(gp1/gp0-1)>0.30?'LARGE_SINGLE_NAME_RETURN':'')};
}
function normalizeTargetForMissing(target, stockRets, cashRet) {
  var eff = {}, notes = [];
  var posValid = [], negValid = [], posMissing = 0, negMissingAbs = 0, posValidSum = 0, negValidAbsSum = 0;
  Object.keys(target).forEach(function(c){
    var w = target[c] || 0;
    var sr = stockRets[c] || {};
    var valid = (c === 'CASH') || (sr.ret !== null && sr.ret !== undefined && isFinite(sr.ret));
    if (valid) {
      eff[c] = w;
      if (w > 0 && c !== 'CASH') { posValid.push(c); posValidSum += w; }
      if (w < 0) { negValid.push(c); negValidAbsSum += Math.abs(w); }
    } else {
      if (w > 0) posMissing += w;
      else if (w < 0) negMissingAbs += Math.abs(w);
      notes.push(c + ':missing');
    }
  });
  if (posMissing > 0) {
    if (posValidSum > 0) {
      posValid.forEach(function(c){ eff[c] += posMissing * ((target[c]||0) / posValidSum); });
    } else {
      eff.CASH = (eff.CASH || 0) + posMissing;
      if (!stockRets.CASH) stockRets.CASH = {ret:cashRet, w:0, wEff:0, method:'CASH'};
    }
  }
  if (negMissingAbs > 0) {
    if (negValidAbsSum > 0) {
      negValid.forEach(function(c){ eff[c] -= negMissingAbs * (Math.abs(target[c]||0) / negValidAbsSum); });
    } else {
      notes.push('short side missing: no valid short to redistribute');
    }
  }
  Object.keys(stockRets).forEach(function(c){ stockRets[c].wNominal = target[c] || 0; stockRets[c].wEff = eff[c] || 0; });
  Object.keys(eff).forEach(function(c){ if (!stockRets[c]) stockRets[c] = {ret:(c==='CASH'?cashRet:null), wNominal:target[c]||0, wEff:eff[c], method:(c==='CASH'?'CASH':'UNKNOWN')}; });
  return {target:eff, notes:notes};
}
function csvEscapeFinal(v) {
  if (v === null || v === undefined) return '';
  var s = String(v);
  if (s.indexOf(',')>=0 || s.indexOf('"')>=0 || s.indexOf('\n')>=0) return '"' + s.replace(/"/g,'""') + '"';
  return s;
}
function downloadAuditCSV() {
  if (!BT_RESULT || !BT_RESULT.records) { alert('請先執行回測'); return; }
  var rows = [];
  rows.push(['Month','Code','Name','NominalWeight%','EffectiveWeight%','AdjReturn%','Contribution%','PrevME_Date','CurrME_Date','PrevAdjPrice','CurrAdjPrice','Method','Note','Flag']);
  BT_RESULT.records.forEach(function(r){
    var keys = Object.keys(r.stockRets || {});
    keys.forEach(function(c){
      var sr = r.stockRets[c] || {};
      var effW = (sr.wEff !== undefined) ? sr.wEff : (sr.w !== undefined ? sr.w : 0);
      var nomW = (sr.wNominal !== undefined) ? sr.wNominal : (sr.w !== undefined ? sr.w : 0);
      var ret = sr.ret;
      rows.push([r.month,c,getStockName(c),(nomW*100).toFixed(6),(effW*100).toFixed(6),ret===null?'':(ret*100).toFixed(6),ret===null?'':(effW*ret*100).toFixed(6),sr.prevME_Date||'',sr.currME_Date||'',sr.prevAdjPrice==null?'':sr.prevAdjPrice,sr.currAdjPrice==null?'':sr.currAdjPrice,sr.method||'',sr.note||'',sr.flag||'']);
    });
    rows.push([r.month,'__MONTH_TOTAL__','MONTH TOTAL','','',((r.grossRet||0)*100).toFixed(6),((r.grossRet||0)*100).toFixed(6),'','','','','GrossReturn','NetReturn%='+((r.pRet||0)*100).toFixed(6)+'; ImplicitFriction%='+((r.implicitFriction||0)*100).toFixed(6)+'; CostModel%='+((r.costFriction||0)*100).toFixed(6)+'; ClosureCostDiff%='+((r.closureCostDiff||0)*100).toFixed(10)+'; ClosureNavDiff%='+((r.closureNavDiff||0)*100).toFixed(10),'']);
  });
  var csv = rows.map(function(row){ return row.map(csvEscapeFinal).join(','); }).join('\n');
  dlText(csv, 'V1.9_Final_Audit_' + new Date().toISOString().slice(0,10) + '.csv', 'text/csv;charset=utf-8');
}
function downloadFrictionCSV() {
  if (!BT_RESULT || !BT_RESULT.records) { alert('請先執行回測'); return; }
  var rows = [['Month','GrossReturn%','NetReturn%','ImplicitFriction%','FrictionBps','TurnoverCost%','ImpactCost%','TotalCost%','Turnover%','ClosureCostDiff%','ClosureNavDiff%','N_Valid','HasLargeReturn','MissingNotes']];
  BT_RESULT.records.forEach(function(r){
    rows.push([r.month,((r.grossRet||0)*100).toFixed(6),((r.pRet||0)*100).toFixed(6),((r.implicitFriction||0)*100).toFixed(6),((r.implicitFriction||0)*10000).toFixed(2),((r.turnoverCost||0)*100).toFixed(6),((r.impactCost||0)*100).toFixed(6),((r.totalCost||r.costFriction||0)*100).toFixed(6),((r.turnover||0)*100).toFixed(6),((r.closureCostDiff||0)*100).toFixed(10),((r.closureNavDiff||0)*100).toFixed(10),r.nValidStocks||0,r.hasLargeReturn?'TRUE':'FALSE',(r.missingNotes||[]).join(';')]);
  });
  var csv = rows.map(function(row){ return row.map(csvEscapeFinal).join(','); }).join('\n');
  dlText(csv, 'V1.9_Friction_Summary_' + new Date().toISOString().slice(0,10) + '.csv', 'text/csv;charset=utf-8');
}
function debugStockMonth(code, ym) {
  var bars = DAILY[code];
  if (!bars) return console.warn('No data', code);
  var mBars = bars.filter(function(b){ return b.date && b.date.slice(0,7) === ym; });
  console.log('=== DEBUG', code, ym, 'bars=', mBars.length, '===');
  mBars.forEach(function(b){ console.log(b.date, b.c); });
  var p = getMonthEndPoint(bars, ym);
  console.log('Month-end:', p);
  return mBars;
}

function runBTcore(mh, mode, opts) {
  opts = opts || {};
  CORR_WIN=parseInt($('corrW')?$('corrW').value:'24')||24;
  if (!CACHE_BUILT) return null;
  var stocks = getEnabledStocks().filter(function(s){ return DAILY[s.c]; });
  if (stocks.length < 3) return null;
  var masterTicker = DAILY['^TWII'] ? '^TWII' : (DAILY['0050'] ? '0050' : (DAILY['SPY'] ? 'SPY' : stocks[0].c));
  var refDaily = DAILY[masterTicker]; if (!refDaily) return null;
  var freq = getFreq();
  var allM = getPreciseRebalanceDates(refDaily, freq);
  var rawS = $('btS') ? ($('btS').value||'').trim().slice(0,10) : '';
  var rawE = $('btE') ? ($('btE').value||'').trim().slice(0,10) : '';
  var lagEl = document.querySelector('input[name="lagMode"]:checked');
  var LAG = lagEl ? parseInt(lagEl.value) : 1;
  var skipMoOnGlobal = !!($('btSkipMo') && $('btSkipMo').checked);
  var MIN = skipMoOnGlobal ? 2 : 1, cS = MIN;
  if (rawS) { for(var i=cS; i<allM.length; i++){ if(allM[i]>=rawS){ cS=i; break; } } }
  var cE=allM.length-1;
  if (rawE) { for(var i2=cE; i2>=cS; i2--){ if(allM[i2]<=rawE){ cE=i2; break; } } }
  if (cS>cE) return null;

  var INIT=gv('btCap')||100000, COST=(gv('btC')||0.3)/100, ct=gv('corrT')||0.75;
  var indLimit=getIndustryLimit();
  var shortN=parseInt($('btSN')?$('btSN').value:'0')||0;
  var capMode=document.querySelector('input[name="capMode"]:checked')?document.querySelector('input[name="capMode"]:checked').value:'neutral';
  var wtModeEl=document.querySelector('input[name="wtMode"]:checked');
  var wtMode=wtModeEl?wtModeEl.value:'eq';
  var shortTSF=!!($('btSTSF')&&$('btSTSF').checked);
  var regimeOn=$('btRegime')&&$('btRegime').value==='on';
  var regimeExp=gv('btRegimeExp')||100;
  var useMA60=$('ma60Filter')?$('ma60Filter').value==='on':true;
  var tnExecMode = opts.tnExecMode || getTNExecMode();

  var nav=INIT, bNav=INIT, records=[], holdings={CASH:1.0};
      var DEFENSIVE=['SGOV'];



  for (var idx=cS; idx<=cE; idx++) {
    var sigM = allM[idx];
    var prevM = allM[idx - 1];

    // Formal backtest is strictly month/half-month based.
    // T-N is only an independent signal-page observation and must not affect NAV.
    // Normal mode: score from previous rebalance date's t-1/t-2.
    // Skip Month ON: score from one full rebalance period earlier's t-1/t-2.
    var scoreBaseM = skipMoOnGlobal ? allM[idx - 2] : prevM;
    if (!scoreBaseM) {
      var b0skip=getPriceOnDate(refDaily,prevM), b1skip=getPriceOnDate(refDaily,sigM);
      if(b0skip&&b1skip&&b0skip>0) bNav*=(1+(b1skip/b0skip-1));
      records.push({month:sigM,period:prevM+" ~ "+sigM,nav:nav,bNav:bNav,holdings:{CASH:1.0},pRet:0,hurdle:0,stockRets:{},scoringM:null,note:'No scoring base'});
      holdings={CASH:1.0};
      continue;
    }
    var scoreM;
    if (opts.signalN !== undefined && opts.signalN !== null) {
      scoreM = getFixedTNDate(refDaily, prevM, opts.signalN);
    } else {
      scoreM = (LAG === 1)
        ? getPrevWorkDay(refDaily, scoreBaseM, 1)
        : (LAG === 2 ? getPrevWorkDay(refDaily, scoreBaseM, 2) : scoreBaseM);
    }
    var tradePrevM = prevM;
    var tradeSigM = sigM;
    if (opts.signalN !== undefined && opts.signalN !== null) {
      tradePrevM = getTNExecutionDate(refDaily, prevM, opts.signalN, tnExecMode);
      tradeSigM = getTNExecutionDate(refDaily, sigM, opts.signalN, tnExecMode);
    }
    var tradePeriod = tradePrevM + " ~ " + tradeSigM;
    var scoringM = scoreM;
    var hurdle = getHurdle(scoringM);
    var sc2 = calcAllScores(scoringM);
    var valid=sc2.filter(function(r){ return r.score!==null; });
    valid.sort(function(a,b){ return b.score-a.score; });

    if (valid.length < 5) {
      var b0x=getPriceOnDate(refDaily,tradePrevM), b1x=getPriceOnDate(refDaily,tradeSigM);
      if(b0x&&b1x&&b0x>0) bNav*=(1+(b1x/b0x-1));
      records.push({month:sigM,period:tradePeriod,nav:nav,bNav:bNav,holdings:{CASH:1.0},pRet:0,hurdle:hurdle,stockRets:{},scoringM:scoreM,tnExecMode:tnExecMode,tradeStart:tradePrevM,tradeEnd:tradeSigM});
      holdings={CASH:1.0}; continue;
    }

    // FIX3: poolModeSetting declared first, exitMap uses calcSimpleMA
    var poolModeSetting = document.getElementById('poolMode').value;

    var exitMap = {};
    if (useMA60) {
      Object.keys(holdings).forEach(function(c) {
        if (c === 'CASH') return;
        var bars = DAILY[c]; if (!bars) return;
        var ma = calcSimpleMA(bars, scoreM, 60);
        var price = getPriceOnDate(bars, scoreM);
        var prevDate = getPrevWorkDay(refDaily, scoreM, 5);
        var prevMa = calcSimpleMA(bars, prevDate, 60);
        if ((ma && price && price < ma) || (ma && prevMa && ma < prevMa)) exitMap[c] = true;
      });
    }

    // FIX3: single unified candidate list; no double pools variable
    var mainCands = valid.filter(function(r) {
      if (r.r240 === null || r.r240 <= hurdle) return false;
      if (DEFENSIVE.indexOf(r.s.c) !== -1) return false;
      if (exitMap[r.s.c]) return false;
      return true;
    });

    var sel = [];

    if (poolModeSetting === 'large') {
      var totalMax = parseInt(document.getElementById('btH').value) || 5;
      mainCands.sort(function(a,b){ return b.score-a.score; });
      for (var ci=0; ci<mainCands.length; ci++) {
        if (sel.length >= totalMax) break;
        var cand = mainCands[ci];
        if (sel.every(function(x){ return Math.abs(calcCorr(cand.s.c,x.s.c,scoreM))<ct; }) && canPickByIndustry(cand, sel, indLimit)) sel.push(cand);
      }
    } else {
      var qTW=parseInt($('btQuotaTW')?$('btQuotaTW').value:'2')||0;
      var qUS=parseInt($('btQuotaUS')?$('btQuotaUS').value:'2')||0;
      var qETF=parseInt($('btQuotaETF')?$('btQuotaETF').value:'1')||0;
      var localPools={'tw':[],'us':[],'etf':[]};
      mainCands.forEach(function(r){ if(localPools[r.s.pool]) localPools[r.s.pool].push(r); });
      var quotaMap={'tw':qTW,'us':qUS,'etf':qETF};
      ['us','tw','etf'].forEach(function(p) {
        localPools[p].sort(function(a,b){ return b.score-a.score; });
        var quota=quotaMap[p], picked=0;
        for (var j=0; j<localPools[p].length; j++) {
          if (picked>=quota) break;
          var cand=localPools[p][j];
          if (sel.every(function(x){ return Math.abs(calcCorr(cand.s.c,x.s.c,scoreM))<ct; }) && canPickByIndustry(cand, sel, indLimit)) { sel.push(cand); picked++; }
        }
      });
    }

    var totalQuota = poolModeSetting==='large' ? (parseInt(document.getElementById('btH').value)||5) : (parseInt($('btQuotaTW')?$('btQuotaTW').value:'2')||0)+(parseInt($('btQuotaUS')?$('btQuotaUS').value:'2')||0)+(parseInt($('btQuotaETF')?$('btQuotaETF').value:'1')||0);
    var longFillSlots = Math.max(0, totalQuota - sel.length);

    var selS=[];
    if (shortN>0) {
      var longMap={};
      sel.forEach(function(r){ longMap[r.s.c]=1; });
      var sCands=valid.filter(function(r){ return r && r.s && !longMap[r.s.c] && r.s.c !== 'SGOV' && r.s.c !== 'CASH' && r.s.pool !== 'etf' && r.s.region !== 'etf'; });
      if (shortTSF) sCands=sCands.filter(function(r){ return r.r240!==null&&r.r240<0; });
      sCands.sort(function(a,b){ return a.score-b.score; });
      for (var ks=0; ks<sCands.length&&selS.length<shortN; ks++) {
        var candS=sCands[ks];
        if (selS.every(function(x){ return Math.abs(calcCorr(candS.s.c,x.s.c,scoreM))<ct; })) selS.push(candS);
      }
    }


    var exposure=1.0;
    if (regimeOn&&isBearishRegime(refDaily,scoreM,60)) exposure=regimeExp/100;

    var target={};
    var is1330 = capMode === '1330';
    var is5050 = capMode === '5050' || capMode === 'neutral';
    var is1000 = capMode === '1000';
    var isShortOnly = capMode === 'short_only';
    var hasShort = (shortN > 0 && selS && selS.length > 0);
    var lScale = 0.0, sScale = 0.0;
    if (isShortOnly) { lScale = 0.0; sScale = hasShort ? 1.0 : 0.0; }
    else if (is1000) { lScale = 1.0; sScale = 0.0; }
    else if (is1330) { lScale = hasShort ? 1.3 : 1.0; sScale = hasShort ? 0.3 : 0.0; }
    else if (is5050) { lScale = hasShort ? 0.5 : 1.0; sScale = hasShort ? 0.5 : 0.0; }
    else { lScale = 1.0; sScale = 0.0; }

    if (!sel.length && !isShortOnly) {
      target['CASH']=1.0;
    } else {
      if (!isShortOnly && sel.length) {
        if (wtMode==='rank') {
          var ldenom=sel.length*(sel.length+1)/2;
          sel.forEach(function(r,i){ target[r.s.c]=lScale*((sel.length-i)/ldenom)*exposure; });
        } else if (wtMode==='ivol') {
          var volSum=0;
          var ivolArr=sel.map(function(r){
            var bars=DAILY[r.s.c];
            var cut=bars ? bars.filter(function(b){ return b.date<=scoreM; }) : [];
            var v=calcVolatility(cut,60);
            v=(v&&v>0)?v:0.20;
            volSum+=1/v;
            return {c:r.s.c,iv:1/v};
          });
          ivolArr.forEach(function(x){ target[x.c]=(lScale*x.iv/volSum)*exposure; });
        } else {
          var lw=(lScale/sel.length)*exposure;
          sel.forEach(function(r){ target[r.s.c]=lw; });
        }
      }
      if (shortN>0&&selS&&selS.length>0&&sScale>0) {
        var sdenom=wtMode==='rank'?selS.length*(selS.length+1)/2:selS.length;
        selS.forEach(function(r,i){
          var weight=(wtMode==='rank')?((selS.length-i)/sdenom):(1/sdenom);
          target[r.s.c]=-sScale*weight*exposure;
        });
      }
      // Long-side defensive fill only; never fills short side and never inserts SGOV into candidate lists.
      if (!isShortOnly && longFillSlots > 0 && totalQuota > 0 && lScale > 0) {
        var defensiveCode = (DAILY['SGOV'] && DAILY['SGOV'].length > 0 && getPriceOnDate(DAILY['SGOV'], scoreM) !== null) ? 'SGOV' : 'CASH';
        var fillWeight = lScale * (longFillSlots / totalQuota) * exposure;
        if (fillWeight > 0.001) target[defensiveCode] = (target[defensiveCode] || 0) + fillWeight;
      }
    }

    // Only pure 100/0 long mode is allowed to top up residual cash by net weight.
    if (capMode === '1000') {
      var totalW=0;
      Object.keys(target).forEach(function(c){ totalW+=target[c]; });
      var cashW=1.0-totalW;
      if (cashW>0.001) target['CASH']=(target['CASH']||0)+cashW;
    }

    var shield = getShieldDecision(scoreM);
    if (shield.enabled && !shield.ok) {
      var shieldCode = (DAILY['SGOV'] && DAILY['SGOV'].length && getPriceOnDate(DAILY['SGOV'], tradePrevM)!==null && getPriceOnDate(DAILY['SGOV'], tradeSigM)!==null) ? 'SGOV' : 'CASH';
      target = {};
      target[shieldCode] = 1.0;
    }

    var turnover=0;
    var allT=Object.keys(holdings).concat(Object.keys(target));
    var seenT={};
    allT.forEach(function(c){
      if(seenT[c]) return; seenT[c]=1;
      var oldW=holdings[c]||0, newW=target[c]||0;
      turnover+=Math.abs(newW-oldW);
    });
    turnover/=2;

    var baseSlippage=0.001;
    var impactMultiplier=Math.max(1,Math.pow(turnover/0.2,1.5));
    var turnoverCost = turnover * COST;
    var impactCost=baseSlippage*impactMultiplier;
    var totalCost = turnoverCost + impactCost;

    var cashRet=0;
    if (DAILY['SGOV']&&getPriceOnDate(DAILY['SGOV'],tradePrevM)&&getPriceOnDate(DAILY['SGOV'],tradeSigM)) {
      var s0=getPriceOnDate(DAILY['SGOV'],tradePrevM), s1=getPriceOnDate(DAILY['SGOV'],tradeSigM);
      cashRet=s1/s0-1;
    } else {
      var cr=getTNXRate(scoreM), cashDivisor=(freq==="2")?24:12;
      var CASH_FACTOR=0.7; // approximate cash rate discount when SGOV unavailable
      cashRet=(cr*CASH_FACTOR)/cashDivisor;
    }

    var stockRets={};
    Object.keys(target).forEach(function(c){
      if (c==='CASH') {
        stockRets[c]={ret:cashRet,w:target[c],wNominal:target[c],wEff:target[c],method:'CASH',note:'Cash/TNX fallback'};
      } else {
        var ar = getAuditReturnPoint(c, tradePrevM, tradeSigM);
        stockRets[c]={ret:ar.ret, w:target[c], wNominal:target[c], wEff:0,
          prevME_Date:ar.prevME_Date, currME_Date:ar.currME_Date,
          prevAdjPrice:ar.prevAdjPrice, currAdjPrice:ar.currAdjPrice,
          method:ar.method, note:ar.note, flag:ar.flag};
      }
    });

    var norm = normalizeTargetForMissing(target, stockRets, cashRet);
    var validTarget = norm.target;
    var missingNotes = norm.notes;
    var grossRet=0, nValidStocks=0, hasLargeReturn=false;
    Object.keys(validTarget).forEach(function(c){
      var w = validTarget[c] || 0;
      var sr = stockRets[c] || {};
      var retVal = (sr.ret === null || sr.ret === undefined) ? 0 : sr.ret;
      grossRet += w * retVal;
      if (c !== 'CASH' && w !== 0 && sr.ret !== null && sr.ret !== undefined) nValidStocks++;
      if (sr.flag === 'LARGE_SINGLE_NAME_RETURN') hasLargeReturn = true;
    });
    if (!isFinite(grossRet)||grossRet<=-0.9999) grossRet=-0.9999;

    // FINAL CLOSURE MODEL:
    // Gross return is rebuilt from each holding's own market month-end prices.
    // Net return is exactly gross minus the explicit cost model, then NAV compounds from net return.
    // Therefore: navReturn == netRet and netRet == grossRet - totalCost, up to floating point precision.
    var netRet = grossRet - totalCost;
    if (!isFinite(netRet) || netRet <= -0.9999) netRet = -0.9999;
    var implicitFriction = grossRet - netRet;
    var costFriction = totalCost;
    var closureCostDiff = netRet - (grossRet - totalCost);
    var navPrev = nav;
    nav *= (1 + netRet);
    var navReturnCheck = navPrev > 0 ? (nav / navPrev - 1) : netRet;
    var closureNavDiff = navReturnCheck - netRet;

    var drifted={};
    for (var c in validTarget) {
      drifted[c]=(validTarget[c]*(1+(stockRets[c]?stockRets[c].ret:0)))/(1+grossRet);
    }

    var b0=getPriceOnDate(refDaily,tradePrevM), b1=getPriceOnDate(refDaily,tradeSigM);
    if (b0&&b1&&b0>0) bNav*=(1+(b1/b0-1));

    var hCopy={};
    Object.keys(target).forEach(function(k){ hCopy[k]=target[k]; });
    var recPeriod = tradePeriod;
    records.push({month:sigM,period:recPeriod,nav:nav,bNav:bNav,holdings:hCopy,effectiveHoldings:validTarget,pRet:netRet,grossRet:grossRet,implicitFriction:implicitFriction,costFriction:costFriction,turnoverCost:turnoverCost,impactCost:impactCost,totalCost:totalCost,turnover:turnover,closureCostDiff:closureCostDiff,closureNavDiff:closureNavDiff,navReturnCheck:navReturnCheck,nValidStocks:nValidStocks,hasLargeReturn:hasLargeReturn,missingNotes:missingNotes,hurdle:hurdle,stockRets:stockRets,scoringM:scoreM,shield:shield,tnExecMode:tnExecMode,tradeStart:tradePrevM,tradeEnd:tradeSigM});
    holdings=drifted;
  }
  return records.length>=6 ? records : null;
}

function kpi(records, init) {
  init = init || (gv('btCap')||100000);
  if (!records||!records.length) return {cagr:0,mdd:0,sharpe:0,nav:init};
  var last=records[records.length-1];
  var yrs=(new Date(last.month)-new Date(records[0].month))/(365.25*86400000);
  var tr=last.nav/init-1, cagr=yrs>0?Math.pow(1+Math.max(tr,-0.999),1/yrs)-1:0;
  var pk=init, mdd=0;
  records.forEach(function(r){ if(r.nav>pk)pk=r.nav; var dd=(r.nav-pk)/pk; if(dd<mdd)mdd=dd; });
  var rets=records.map(function(r){ return r.pRet; });
  var avg=rets.reduce(function(a,b){return a+b;},0)/rets.length;
  var variance=rets.reduce(function(a,b){return a+Math.pow(b-avg,2);},0)/(rets.length>1?rets.length-1:1);
  var periods=getAnnualPeriods();
  var std=Math.sqrt(variance)*Math.sqrt(periods)||1;
  return {cagr:cagr,mdd:mdd,sharpe:(cagr-0.015)/std,nav:last.nav};
}


function runTNBacktest() {
  if (!Object.keys(DAILY).length) { alert('Fetch data first'); return; }
  var tn=Math.max(0,Math.min(22,parseInt($('btSignalTN')?$('btSignalTN').value:'10')||0));
  SKIP_MO=false;
  CORR_WIN=parseInt($('corrW')?$('corrW').value:'24')||24;
  sl('btLog','Calculating fair T-'+tn+' backtest...',null); showL('T-'+tn+' Fair Backtesting...');
  setTimeout(async function() {
    try {
      await ensureCacheBuilt('backtest');
      var mh=parseInt($('btH')?$('btH').value:'3')||3;
      var mode=getWeightMode(), init=gv('btCap')||100000;
      var tnExecMode=getTNExecMode();
      var records=runBTcore(mh,mode,{signalN:tn,tnExecMode:tnExecMode});
      if (!records) { alert('Not enough data'); hideL(); return; }
      BT_RESULT={records:records,initial:init,mode:mode,mh:mh,signalTN:tn,tnExecMode:tnExecMode};
      renderBT(records,init,mode);
      var dStart=records[0].month, dEnd=records[records.length-1].month;
      sl('btLog','T-'+tn+' 公平回測完成: '+dStart+' 至 '+dEnd+' | '+describeTNExecMode(tnExecMode,tn),true);
    } catch(err) {
      sl('btLog','Error: '+err.message,false); console.error(err);
    } finally { hideL(); }
  }, 80);
}

function runBT() {
  if (!Object.keys(DAILY).length) { alert('Fetch data first'); return; }
  SKIP_MO=!!($('btSkipMo')&&$('btSkipMo').checked);
  CORR_WIN=parseInt($('corrW')?$('corrW').value:'24')||24;
  sl('btLog','Calculating...',null); showL('Backtesting...');
  setTimeout(async function() {
    try {
      await ensureCacheBuilt('backtest');
      var mh=parseInt($('btH')?$('btH').value:'3')||3;
      var mode=getWeightMode(), init=gv('btCap')||100000;
      var records=runBTcore(mh,mode);
      if (!records) { alert('Not enough data'); hideL(); return; }
      BT_RESULT={records:records,initial:init,mode:mode,mh:mh};
      renderBT(records,init,mode);
      var dStart=records[0].month, dEnd=records[records.length-1].month;
      sl('btLog','\u56de\u6e2c\u5b8c\u6210: '+dStart+' \u81f3 '+dEnd+' (\u5171 '+records.length+' \u671f)',true);
    } catch(err) { sl('btLog','Error: '+err.message,false); console.error(err); }
    finally { hideL(); }
  }, 80);
}

// FIX4: runCompare - origH saved, restore in finally
function runCompare() {
  if (!Object.keys(DAILY).length) { alert('Fetch data first'); return; }
  SKIP_MO=!!($('btSkipMo')&&$('btSkipMo').checked);
  CORR_WIN=parseInt($('corrW')?$('corrW').value:'24')||24;
  var maxN=parseInt($('btH')?$('btH').value:'5')||5, mode=getWeightMode();
  var elMode=document.getElementById('poolMode');
  var origMode=elMode?elMode.value:'large';
  var origH=$('btH')?$('btH').value:'5';
  if (elMode) elMode.value='large';
  sl('btLog','Comparing N=1 to '+maxN+'...',null); showL('Comparing...');
  setTimeout(async function() {
    try {
      await ensureCacheBuilt('backtest');
      var init=gv('btCap')||100000, results=[];
      for (var n=1; n<=maxN; n++) {
        if ($('btH')) $('btH').value=n;
        var recs=runBTcore(n,mode);
        if (recs) results.push({n:n,recs:recs,k:kpi(recs,init)});
      }
      if (!results.length) { alert('No results'); return; }
      renderCompare(results,init,mode);
      var dStart=results[0].recs[0].month;
      var dEnd=results[0].recs[results[0].recs.length-1].month;
      sl('btLog','\u6bd4\u8f03\u5b8c\u6210 N=1~'+maxN+' | \u671f\u9593: '+dStart+' \u81f3 '+dEnd,true);
    } catch(err) { sl('btLog','Error: '+err.message,false); console.error(err); }
    finally {
      if (elMode) elMode.value=origMode;
      if ($('btH')) $('btH').value=origH;
      hideL();
    }
  }, 80);
}
var CMP_COLORS=['#ff6b9d','#a78bfa','#00d4aa','#ffb830','#4d9fff','#00e5a0','#ff4d6d','#7eb8ff'];
function renderCompare(results,init,mode) {
  $('btRes').classList.remove('hidden');
  var fmt=function(v,p,pl){return (pl&&v>=0?'+':'')+(p?(v*100).toFixed(2)+'%':v.toFixed(2));};
  var html='<div class="tw-wrap" style="margin-bottom:10px"><table><thead><tr><th>N</th><th>Weight</th><th>CAGR</th><th>MDD</th><th>Sharpe</th><th>Final NAV</th></tr></thead><tbody>';
  results.forEach(function(res,i){
    var k=res.k;
    html+='<tr><td class="mono" style="font-weight:700;color:'+CMP_COLORS[i%CMP_COLORS.length]+'">'+res.n+'</td>'
      +'<td style="font-size:10px;color:var(--mu)">'+(mode==='rank'?'Rank':'Equal')+'</td>'
      +'<td class="mono" style="color:'+(k.cagr>=0?'var(--gr)':'var(--re)')+'">'+fmt(k.cagr,true,true)+'</td>'
      +'<td class="mono" style="color:var(--re)">'+fmt(k.mdd,true)+'</td>'
      +'<td class="mono" style="color:'+(k.sharpe>=1?'var(--gr)':k.sharpe>=0?'var(--ye)':'var(--re)')+'">'+k.sharpe.toFixed(2)+'</td>'
      +'<td class="mono" style="color:var(--wh)">$'+Math.round(k.nav).toLocaleString()+'</td></tr>';
  });
  html+='</tbody></table></div>';
  $('btMetrics').innerHTML=html;
  $('chartArea').style.display='block'; $('btnChart').textContent='Hide Charts';
  if(CHART.n)CHART.n.destroy(); if(CHART.d)CHART.d.destroy();
  var labels=results[0].recs.map(function(r){return r.month;});
  var datasets=results.map(function(res,i){return {label:'N='+res.n,data:res.recs.map(function(r){return r.nav;}),borderColor:CMP_COLORS[i%CMP_COLORS.length],borderWidth:2,pointRadius:0};});
  datasets.push({label:'TAIEX',data:results[0].recs.map(function(r){return r.bNav;}),borderColor:'#3d4a66',borderWidth:1,pointRadius:0});
  var sc={x:{ticks:{color:'#6b7a99',maxTicksLimit:12},grid:{color:'#1a2030'}},y:{ticks:{color:'#6b7a99'},grid:{color:'#1a2030'}}};
  var opt={responsive:true,maintainAspectRatio:false,interaction:{intersect:false,mode:'index'},animation:{duration:200},plugins:{legend:{labels:{color:'#6b7a99',boxWidth:10,font:{size:11}}}}};
  CHART.n=new Chart($('navC').getContext('2d'),{type:'line',data:{labels:labels,datasets:datasets},options:Object.assign({},opt,{scales:Object.assign({},sc,{y:Object.assign({},sc.y,{type:'logarithmic'})})})});
  $('btBody').innerHTML='<tr><td colspan="7" style="text-align:center;color:var(--mu);padding:12px;font-size:12px">Run single backtest to see monthly holdings detail.</td></tr>';
}

function renderBT(records,init,mode) {
  var recs=records; $('btRes').classList.remove('hidden');
  var last=recs[recs.length-1];
  var yrs=(new Date(last.month)-new Date(recs[0].month))/(365.25*86400000);
  var tr=last.nav/init-1, cagr=yrs>0?Math.pow(1+Math.max(tr,-0.999),1/yrs)-1:0;
  var btr=last.bNav/init-1, bcagr=yrs>0?Math.pow(1+Math.max(btr,-0.999),1/yrs)-1:0;
  var pk=init, mdd=0;
  recs.forEach(function(r){if(r.nav>pk)pk=r.nav;var dd=(r.nav-pk)/pk;if(dd<mdd)mdd=dd;});
  var rets=recs.map(function(r){return r.pRet;});
  var avg=rets.reduce(function(a,b){return a+b;},0)/rets.length;
  var std=Math.sqrt(rets.reduce(function(a,b){return a+Math.pow(b-avg,2);},0)/(rets.length>1?rets.length-1:1))*Math.sqrt(12)||1;
  var sh=(cagr-0.015)/std;
  var fmt=function(v,p,pl){return (pl&&v>=0?'+':'')+(p?(v*100).toFixed(2)+'%':v.toFixed(2));};
  var modeLabel=mode==='rank'?'Rank-Weighted':'Equal-Weighted';
  $('btMetrics').innerHTML=
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'
    +'<div class="card" style="border-top:3px solid var(--tw);">'
    +'<div class="ct">Strategy V1.9 ('+modeLabel+')</div>'
    +'<div class="mr"><span>Final NAV</span><span class="mv wh">$'+Math.round(last.nav).toLocaleString()+'</span></div>'
    +'<div class="mr"><span>Return</span><span class="mv '+(tr>=0?'tg':'tr')+'">'+fmt(tr,true,true)+'</span></div>'
    +'<div class="mr"><span>CAGR</span><span class="mv">'+fmt(cagr,true)+'</span></div>'
    +'<div class="mr"><span>MDD</span><span class="mv tr">'+fmt(mdd,true)+'</span></div>'
    +'<div class="mr"><span>Sharpe</span><span class="mv tg">'+sh.toFixed(2)+'</span></div>'
    +'<div class="mr"><span>Avg Implicit Friction</span><span class="mv tr">'+fmt((recs.reduce(function(a,r){return a+(r.implicitFriction||0);},0)/recs.length),true)+'</span></div>'
    +'</div>'
    +'<div class="card" style="border-top:3px solid var(--mu);">'
    +'<div class="ct">TAIEX Benchmark</div>'
    +'<div class="mr"><span>Return</span><span class="mv '+(btr>=0?'tg':'tr')+'">'+fmt(btr,true,true)+'</span></div>'
    +'<div class="mr"><span>CAGR</span><span class="mv">'+fmt(bcagr,true)+'</span></div>'
    +'<div class="mr"><span>Alpha</span><span class="mv '+((cagr-bcagr)>=0?'tg':'tr')+'">'+fmt(cagr-bcagr,true,true)+'</span></div>'
    +'</div></div>' + renderLatestHoldingsPriceBox(last);

  if ($('chartArea').style.display!=='none') {
    if(CHART.n)CHART.n.destroy(); if(CHART.d)CHART.d.destroy();
    var lbs=recs.map(function(r){return r.month.slice(2,7);});
    var navs=recs.map(function(r){return r.nav;}), bnavs=recs.map(function(r){return r.bNav;});
    var dds=[],bdds=[];
    var p=init,bp=init;
    recs.forEach(function(r){
      if(r.nav>p)p=r.nav; dds.push((r.nav-p)/p*100);
      if(r.bNav>bp)bp=r.bNav; bdds.push((r.bNav-bp)/bp*100);
    });
    Chart.defaults.color='#6b7a99';
    Chart.defaults.font.family="'IBM Plex Mono', monospace";
    var ctxN=$('navC').getContext('2d'), ctxD=$('ddC').getContext('2d');
    CHART.n=new Chart(ctxN,{type:'line',data:{labels:lbs,datasets:[
      {label:'Strategy',data:navs,borderColor:'#ff6b9d',borderWidth:2,pointRadius:0,tension:0.1},
      {label:'TAIEX',data:bnavs,borderColor:'#4d9fff',borderWidth:1.5,borderDash:[3,3],pointRadius:0,tension:0.1}
    ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top',labels:{boxWidth:12,font:{size:10}}}},scales:{x:{grid:{color:'#252d3d'},ticks:{maxTicksLimit:8,font:{size:9}}},y:{grid:{color:'#252d3d'},ticks:{font:{size:10}}}}}});
    CHART.d=new Chart(ctxD,{type:'line',data:{labels:lbs,datasets:[
      {label:'Strat DD%',data:dds,borderColor:'#ff4d6d',backgroundColor:'rgba(255,77,109,0.1)',borderWidth:1,fill:true,pointRadius:0,tension:0.1},
      {label:'Bench DD%',data:bdds,borderColor:'#6b7a99',borderWidth:1,borderDash:[2,2],pointRadius:0,tension:0.1}
    ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{display:false},y:{grid:{color:'#252d3d'},ticks:{font:{size:10}},max:0}}}});
  }

  $('btBody').innerHTML=recs.slice().reverse().map(function(r,ri){
    var idx2=recs.length-1-ri;
    var pb=idx2>0?recs[idx2-1].bNav:init;
    var prevNav=idx2>0?recs[idx2-1].nav:init;
    var bRet=r.bNav/pb-1;
    var ex=r.pRet-bRet;
    var rc=r.pRet>=0?'var(--gr)':'var(--re)';
    var ec=ex>=0?'var(--gr)':'var(--re)';
    var holdStr=Object.keys(r.holdings).map(function(k){
      var wt=r.holdings[k];
      var isShort=wt<0;
      var isUs=!!(document.querySelector('[data-code="'+k+'"][data-tw="0"]'));
      var col=isShort?'var(--bl)':(isUs?'var(--us)':'var(--tw)');
      var bg=isShort?'var(--bld)':(isUs?'var(--usd)':'var(--twd)');
      var bst=isShort?'dashed':'solid';
      var nm=getStockName(k);
      var pct=Math.abs(wt*100).toFixed(0)+'%';
      var lbl=(isShort?'S ':'')+k+(nm&&nm!==k?' '+nm:'');
      return '<span style="background:'+bg+';color:'+col+';border:1px '+bst+' '+col+';padding:1px 6px;border-radius:3px;font-size:10px;font-family:monospace;margin:1px;">'+lbl+' '+pct+'</span>';
    }).join('');
    var summaryRow='<tr style="border-top:2px solid var(--bd);">'
      +'<td class="mono" style="font-weight:700;vertical-align:top;">'+r.month+(r.scoringM?'<div style="font-size:9px;color:var(--mu)">\u9078\u80a1:'+r.scoringM+'</div>':'')+'</td>'
      +'<td style="vertical-align:top;">'+holdStr+'</td>'
      +'<td class="mono" style="font-size:10px;color:var(--bl);vertical-align:top;">'+(r.hurdle*100).toFixed(1)+'%</td>'
      +'<td class="mono" style="color:'+rc+';font-weight:700;vertical-align:top;">'+(r.pRet>=0?'+':'')+(r.pRet*100).toFixed(2)+'%</td>'
      +'<td class="mono" style="color:var(--tw);font-weight:700;vertical-align:top;">$'+Math.round(r.nav).toLocaleString()+'</td>'
      +'<td class="mono" style="color:var(--mu);vertical-align:top;">$'+Math.round(r.bNav).toLocaleString()+'</td>'
      +'<td class="mono" style="color:'+ec+';font-weight:700;vertical-align:top;">'+(ex>=0?'+':'')+(ex*100).toFixed(2)+'pp</td>'
      +'</tr>';
    var detailRows='';
    if (r.stockRets) {
      Object.keys(r.stockRets).forEach(function(k){
        var sr=r.stockRets[k], ret=sr.ret, w=(sr.wEff!==undefined?sr.wEff:(sr.w||0));
        var contrib=ret*w, pnl=prevNav*contrib;
        var isShortPos=w<0;
        var isUs=!!(document.querySelector('[data-code="'+k+'"][data-tw="0"]'));
        var col=isShortPos?'var(--bl)':(isUs?'var(--us)':'var(--tw)');
        var rc2=contrib>=0?'var(--gr)':'var(--re)';
        var nm=getStockName(k);
        var dirLabel=isShortPos?'[S] ':'';
        var absPct=Math.abs(w*100).toFixed(0)+'%';
        detailRows+='<tr style="background:var(--bg);opacity:0.85;">'
          +'<td style="padding:3px 8px;border-bottom:1px solid var(--bd);"></td>'
          +'<td style="padding:3px 8px;border-bottom:1px solid var(--bd);font-family:monospace;font-size:11px;color:'+col+';">'
          +dirLabel+k+(nm&&nm!==k?' <span style="color:var(--mu);font-size:10px;">'+nm+'</span>':'')
          +' <span style="color:var(--mu);font-size:10px;">'+absPct+'</span>'
          +'</td>'
          +'<td style="padding:3px 8px;border-bottom:1px solid var(--bd);"></td>'
          +'<td class="mono" style="padding:3px 8px;border-bottom:1px solid var(--bd);font-size:11px;color:var(--mu);">'
          +(ret>=0?'+':'')+(ret*100).toFixed(2)+'%'
          +'</td>'
          +'<td class="mono" style="padding:3px 8px;border-bottom:1px solid var(--bd);font-size:11px;color:'+rc2+';">'
          +(pnl>=0?'+$':'-$')+Math.abs(Math.round(pnl)).toLocaleString()
          +'</td>'
          +'<td colspan="2" style="padding:3px 8px;border-bottom:1px solid var(--bd);font-size:10px;color:'+rc2+';">'
          +'contrib: '+(contrib>=0?'+':'')+(contrib*100).toFixed(2)+'%'
          +(sr.entry?'<span style="font-size:9px;color:var(--mu);margin-left:6px;font-family:monospace">T-9:'+sr.entry+'</span>':'')+'</td></tr>';
      });
    }
    return summaryRow+detailRows;
  }).join('');
}

function pct(v,d){return (v>=0?'+':'')+(v*100).toFixed(d===undefined?1:d)+'%';}
function median(arr){if(!arr.length)return 0;var s=arr.slice().sort(function(a,b){return a-b;});var m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2;}
function percentile(arr,p){if(!arr.length)return 0;var s=arr.slice().sort(function(a,b){return a-b;});var i=(p/100)*(s.length-1);var lo=Math.floor(i),hi=Math.ceil(i);return s[lo]+(s[hi]-s[lo])*(i-lo);}

function runRolling() {
  if (!BT_RESULT) { alert('Run backtest first'); return; }
  var recs=BT_RESULT.records, init=BT_RESULT.initial;
  var periods=[1,2,3,5].filter(function(n){var e=$('rl'+n);return e&&e.checked;});
  if (!periods.length) { alert('Select at least one period'); return; }
  var res={};
  var freq=getFreq();
  periods.forEach(function(N){
    var mo=(freq==="2")?N*24:N*12, wins=[];
    for (var i=0; i+mo<=recs.length; i++) {
      var sub=recs.slice(i,i+mo);
      var navS=i>0?recs[i-1].nav:init, navE=sub[sub.length-1].nav;
      var cagr=Math.pow(navE/navS,1/N)-1;
      var bNavS=i>0?recs[i-1].bNav:init, bNavE=sub[sub.length-1].bNav;
      var bcagr=Math.pow(bNavE/bNavS,1/N)-1;
      var rets=sub.map(function(r){return r.pRet;});
      var avg=rets.reduce(function(a,b){return a+b;},0)/rets.length;
      var variance=rets.reduce(function(a,b){return a+(b-avg)*(b-avg);},0)/rets.length;
      var std=Math.sqrt(variance)*Math.sqrt(freq==="2"?24:12);
      var sharpe=std>0?(cagr-0.015)/std:0;
      var peak=navS, mdd=0;
      sub.forEach(function(r){if(r.nav>peak)peak=r.nav;var dd=(r.nav-peak)/peak;if(dd<mdd)mdd=dd;});
      wins.push({cagr:cagr,bcagr:bcagr,std:std,sharpe:sharpe,mdd:mdd});
    }
    res[N]=wins;
  });
  renderRolling(res,periods);
}

function renderRolling(res,periods) {
  var el=$('rollingRes');
  if(!el)return; el.classList.remove('hidden');
  var fmt=function(v,d){return (v>=0?'+':'')+(v*100).toFixed(d===undefined?1:d)+'%';};
  var fmtN=function(v,d){return v.toFixed(d===undefined?2:d);};
  var gc=function(v){return v>=0?'var(--gr)':'var(--re)';};
  var html='<div class="card"><div class="ct">\u6ede\u52d5\u5831\u916c\u5206\u6790 (CAGR)</div>';
  periods.forEach(function(N){
    var ws=res[N]; if(!ws||!ws.length)return;
    var cagrs=ws.map(function(w){return w.cagr;}), bcagrs=ws.map(function(w){return w.bcagr;}), stds=ws.map(function(w){return w.std;}), sharpes=ws.map(function(w){return w.sharpe;}), mdds=ws.map(function(w){return w.mdd;});
    var winRate=cagrs.filter(function(v){return v>0;}).length/cagrs.length;
    var beatRate=ws.filter(function(w){return w.cagr>w.bcagr;}).length/ws.length;
    html+='<div style="margin-bottom:14px"><div style="font-size:11px;font-weight:700;color:var(--tw);margin-bottom:6px">'+N+' \u5e74 ('+ws.length+' \u7a97\u53e3)</div><div class="tw-wrap" style="max-height:none"><table><thead><tr><th>\u6307\u6a19</th><th>\u4e2d\u4f4d</th><th>\u5e73\u5747</th><th>P10</th><th>P90</th><th>\u52dd\u7387</th><th>\u8d85TAIEX</th></tr></thead><tbody>';
    var rows=[['\u5e74\u5316CAGR',cagrs,true],['\u5e74\u5316\u6a19\u6e96\u5dee',stds,false],['Sharpe',sharpes,false],['MDD',mdds,true]];
    rows.forEach(function(row){
      var label=row[0],arr=row[1],isCagr=row[2];
      var med=median(arr),avg=arr.reduce(function(a,b){return a+b;},0)/arr.length,p10=percentile(arr,10),p90=percentile(arr,90);
      var isPct=label!=='Sharpe', f=function(v){return isPct?fmt(v,1):fmtN(v,2);};
      html+='<tr><td style="color:var(--mu);font-size:10px">'+label+'</td><td class="mono" style="color:'+gc(med)+'">'+f(med)+'</td><td class="mono" style="color:'+gc(avg)+'">'+f(avg)+'</td><td class="mono" style="color:'+gc(p10)+'">'+f(p10)+'</td><td class="mono" style="color:'+gc(p90)+'">'+f(p90)+'</td>';
      if(isCagr&&label==='\u5e74\u5316CAGR'){html+='<td class="mono" style="color:var(--gr)">'+(winRate*100).toFixed(0)+'%</td><td class="mono" style="color:var(--ye)">'+(beatRate*100).toFixed(0)+'%</td>';}else{html+='<td></td><td></td>';}
      html+='</tr>';
    });
    var bmed=median(bcagrs),bavg=bcagrs.reduce(function(a,b){return a+b;},0)/bcagrs.length,bp10=percentile(bcagrs,10),bp90=percentile(bcagrs,90),bwin=bcagrs.filter(function(v){return v>0;}).length/bcagrs.length;
    html+='<tr style="border-top:1px solid var(--bhi)"><td style="color:var(--mu);font-size:10px">TAIEX CAGR</td><td class="mono" style="color:'+gc(bmed)+'">'+fmt(bmed,1)+'</td><td class="mono" style="color:'+gc(bavg)+'">'+fmt(bavg,1)+'</td><td class="mono" style="color:'+gc(bp10)+'">'+fmt(bp10,1)+'</td><td class="mono" style="color:'+gc(bp90)+'">'+fmt(bp90,1)+'</td><td class="mono" style="color:var(--mu)">'+(bwin*100).toFixed(0)+'%</td><td></td></tr></tbody></table></div></div>';
  });
  html+='</div>'; el.innerHTML=html;
}

function toggleCharts(btn) {
  var area=$('chartArea'); if(!area)return;
  var hidden=area.style.display==='none'; area.style.display=hidden?'block':'none';
  btn.textContent=hidden?'Hide Charts':'Show Charts (NAV / MDD)';
  if(hidden&&CHART.n){CHART.n.resize();if(CHART.d)CHART.d.resize();}
}
// FIX1: all ghost variable references removed
function dlJson() {
  if (!DAILY || !Object.keys(DAILY).length) { sl('dlLog','No data',false); return; }
  var obj = { ts: new Date().toISOString(), DAILY: DAILY };
  dlBlob(new Blob([JSON.stringify(obj)],{type:'application/json'}), 'V1.9_'+new Date().toISOString().slice(0,10)+'.json');
  sl('dlLog','JSON downloaded',true);
}
function dlOHLCV() {
  var rows=['code,date,o,h,l,c,v'];
  Object.keys(DAILY).forEach(function(k){ DAILY[k].forEach(function(w){ rows.push(k+','+w.date+','+w.o+','+w.h+','+w.l+','+w.c+','+w.v); }); });
  dlText(rows.join('\n'),'V1.9_OHLCV_'+new Date().toISOString().slice(0,10)+'.csv','text/csv;charset=utf-8');
  sl('dlLog','OHLCV CSV downloaded',true);
}
function dlMonthly() { alert('V1.9 uses DAILY data natively. Please use OHLCV export.'); }
function dlBtCsv() {
  if (!BT_RESULT) { sl('btLog','Run backtest first',false); return; }
  var recs=BT_RESULT.records, init=BT_RESULT.initial, rows=['Date,Holdings,Hurdle%,Return%,NAV,BenchNav,Alpha%'];
  recs.forEach(function(r,i){
    var pb=i>0?recs[i-1].bNav:init; var ex=r.pRet-(r.bNav/pb-1);
    var hold=Object.keys(r.holdings).map(function(k){ var nm=getStockName(k); return k+(nm&&nm!==k?'('+nm+')':'')+(r.holdings[k]<0.99?' '+(r.holdings[k]*100).toFixed(0)+'%':''); }).join('+');
    rows.push([r.month,hold,(r.hurdle*100).toFixed(2),(r.pRet*100).toFixed(3),Math.round(r.nav),Math.round(r.bNav),(ex*100).toFixed(3)].join(','));
  });
  dlText(rows.join('\n'),'V1.9_Backtest_'+new Date().toISOString().slice(0,10)+'.csv','text/csv;charset=utf-8');
}
async function upJson(el) {
  var file=el.files[0]; if(!file)return;
  sl('dlLog','Loading '+file.name+'...',null);
  try {
    var text=await file.text(); var obj=JSON.parse(text);
    if(!obj.DAILY){ sl('dlLog','Error: no DAILY field',false); return; }
    DAILY=obj.DAILY||{};
    updFetchStat(); updTNX(); markCacheDirty('jsonUpload'); await saveAllToDB();
    sl('dlLog','Loaded! Cache 延後到信號/回測前自動重建。',true);
  } catch(err){ sl('dlLog','Error: '+err.message,false); }
  el.value='';
}
async function clearAndReset() {
  if(!confirm('Clear all cached data and IndexedDB?'))return;
  await new Promise(function(resolve){
    var req = indexedDB.deleteDatabase('FearlessConsoleDB');
    req.onsuccess = req.onerror = req.onblocked = function(){ resolve(); };
  });
  DAILY={}; CACHE_BUILT=false; CACHE_TS=null; RAW_SCORES={};
  resetDerivedViews('clearAndReset');
  sl('dlLog','DB cleared. Please run Fetch All.',true);
  updFetchStat(); updCacheSt();
}
function debugDataLen() {
  var keys=Object.keys(DAILY); var msg='DAILY stocks: '+keys.length;
  if(keys.length){
    msg+='\n'+keys[0]+': '+DAILY[keys[0]].length+' days';
    msg+='\n'+keys[keys.length-1]+': '+DAILY[keys[keys.length-1]].length+' days';
  }
  msg+='\nRAW_SCORES keys: '+Object.keys(RAW_SCORES).length; alert(msg);
}

// FIX5: checkDataHealth - no emoji in JS strings
function checkDataHealth() {
  var stocks=getEnabledStocks(); var now=new Date(); var tbody=$('healthBody');
  var staleNum=0, totalDelay=0, html='';
  stocks.forEach(function(s){
    var data=DAILY[s.c]; var delay=999, lastD='\u7121\u8cc7\u6599';
    if(data&&data.length>0){
      var lastDate=new Date(data[data.length-1].date);
      lastD=data[data.length-1].date;
      delay=Math.floor((now-lastDate)/(1000*60*60*24));
    }
    var isStale=delay>5; if(isStale)staleNum++; if(delay!==999)totalDelay+=delay;
    var statusLabel=isStale
      ? '<span style="color:var(--re)">\u2718 \u9700\u66f4\u65b0</span>'
      : '<span style="color:var(--te)">\u2714 \u6b63\u5e38</span>';
    html+='<tr>'
      +'<td>'+(s.tw?'TW \u53f0\u80a1':'US \u7f8e\u80a1')+'</td>'
      +'<td class="mono">'+s.c+'</td>'
      +'<td class="mono">'+lastD+'</td>'
      +'<td class="mono">'+(delay===999?'?':delay+'d')+'</td>'
      +'<td>'+statusLabel+'</td>'
      +'</tr>';
  });
  tbody.innerHTML=html||'<tr><td colspan="5">\u7121\u555f\u7528\u4e2d\u7684\u6a19\u7684</td></tr>';
  $('staleCount').textContent=staleNum;
  $('avgDelay').textContent=stocks.length?(totalDelay/stocks.length).toFixed(1):0;
}
async function calcSignal() {
  if(!Object.keys(DAILY).length){ alert('請先抓取或載入資料'); return; }
  SKIP_MO=!!($('btSkipMo')&&$('btSkipMo').checked);
  await ensureCacheBuilt('signal');
  var stocks=getEnabledStocks().filter(function(s){ return RAW_SCORES[s.c]; });
  if(!stocks.length)return;
  var masterTicker = DAILY['^TWII'] ? '^TWII' : (DAILY['0050'] ? '0050' : (DAILY['SPY'] ? 'SPY' : stocks[0].c));
  var refDaily = DAILY[masterTicker];
  var sigInfo = getSignalTNInfo(refDaily);
  if (!sigInfo) { alert('找不到 Signal Month 資料。請輸入 YYYY-MM，或確認資料已載入。'); return; }
  var sigN = sigInfo.N;
  if (!sigInfo.ready) {
    $('sigContent').innerHTML = '<div class="ib2" style="border-left:3px solid var(--ye);color:var(--ye)">尚未到達 T-'+sigN+' 訊號日<br>月份: <b>'+sigInfo.ym+'</b><br>T（月末）: <b>'+sigInfo.T+'</b> '+(sigInfo.source==='estimated'?'(依週一至週五估算)':'')+'<br>T-'+sigN+': <b>'+sigInfo.tN+'</b><br>最新資料: <b>'+sigInfo.lastDate+'</b></div>';
    $('stCard').classList.add('hidden');
    return;
  }
  var latestDate = sigInfo.scoreDate || sigInfo.tN;
  buildScoreCacheForDate(latestDate);
  var hurdle=getHurdle(latestDate);
  var allScores=calcAllScores(latestDate);
  if (!allScores.length) {
    await buildCache();
    buildScoreCacheForDate(latestDate);
    allScores=calcAllScores(latestDate);
  }
  if (!allScores.length) { alert('T-'+sigN+' 訊號日 '+latestDate+' 沒有足夠資料。請先重新抓取/重建快取。'); return; }
  var mode=$('poolMode').value, ct=gv('corrT')||0.75;
  var indLimit=getIndustryLimit();
  var sel=[], rejectedMap={};
  allScores.forEach(function(r){ if(r.r240<=hurdle) rejectedMap[r.s.c]='\u0054\u0053 \u6DD8\u6C70'; });
  if(mode==='large'){
    var candidates=allScores.filter(function(r){return !rejectedMap[r.s.c];}).sort(function(a,b){return b.score-a.score;});
    var totalMax=parseInt($('btH').value)||5;
    for(var ci=0; ci<candidates.length; ci++){
      var cand=candidates[ci];
      if(sel.length>=totalMax){ rejectedMap[cand.s.c]='\u540d\u984d\u5df2\u6eff'; continue; }
      if(!sel.every(function(x){ return Math.abs(calcCorr(cand.s.c,x.s.c,latestDate))<ct; })) rejectedMap[cand.s.c]='\u76f8\u95dc\u6027\u904e\u9ad8';
      else if(!canPickByIndustry(cand, sel, indLimit)) rejectedMap[cand.s.c]='同產業限額';
      else sel.push(cand);
    }
  } else {
    var sub={'tw':[],'us':[],'etf':[]};
    allScores.filter(function(r){ return !rejectedMap[r.s.c]; }).forEach(function(r){ if(sub[r.s.pool]) sub[r.s.pool].push(r); });
    ['us','tw','etf'].forEach(function(p){
      var q={'tw':gv('btQuotaTW'),'us':gv('btQuotaUS'),'etf':gv('btQuotaETF')}[p], picked=0;
      var list=sub[p].sort(function(a,b){return b.score-a.score;});
      for(var ci2=0; ci2<list.length; ci2++){
        var cand=list[ci2];
        if(picked>=q){ rejectedMap[cand.s.c]='\u914d\u984d\u5df2\u6eff'; continue; }
        if(!sel.every(function(x){ return Math.abs(calcCorr(cand.s.c,x.s.c,latestDate))<ct; })){ rejectedMap[cand.s.c]='\u76f8\u95dc\u6027\u904e\u9ad8'; }
        else if(!canPickByIndustry(cand, sel, indLimit)){ rejectedMap[cand.s.c]='同產業限額'; }
        else { sel.push(cand); picked++; }
      }
    });
  }
  renderSig(sel,allScores.slice().sort(function(a,b){return a.score-b.score;}).slice(0,3),allScores,latestDate,hurdle);
  renderST(allScores,hurdle,sel.map(function(s){return s.s.c;}),rejectedMap,latestDate);
}

// FIX5: renderSig - no emoji in poolNames
function renderSig(sel,wk,all,date,hurdle) {
  var zf=function(v){return v!==null?(v>=0?'+':'')+v.toFixed(2):'-';};
  var pf=function(v){return v!==null?(v>=0?'+':'')+(v*100).toFixed(1)+'%':'-';};
  var tnx=getTNXRate(date);
  var sigN = $('sigTN') ? ($('sigTN').value || '10') : '10';
  var html='<div style="font-size:11px;color:var(--mu);margin-bottom:9px">Signal: <b style="color:var(--tw)">T-'+sigN+'</b> | Score Date: <b style="color:var(--tw)">'+date+'</b> | ^TNX: <b style="color:var(--bl)">'+(tnx*100).toFixed(2)+'%</b> | Hurdle: <b style="color:var(--ye)">'+(hurdle*100).toFixed(2)+'%</b><br><span style="color:var(--mu)">此為信號頁獨立觀察訊號；未指定月份時使用最新資料所在月份，若尚未到達 T-N 則提示等待；正式回測仍用純月頻/半月頻。</span></div>';
  var selPools={'us':[],'tw':[],'etf':[]};
  sel.forEach(function(r){ var p=r.s.pool; if(p==='us'||p==='tw'||p==='etf') selPools[p].push(r); });
  // FIX5: pure ASCII/unicode labels, no surrogate-pair emoji
  var poolNames={'us':'US \u7f8e\u80a1\u914d\u7f6e','tw':'TW \u53f0\u80a1\u914d\u7f6e','etf':'ETF \u914d\u7f6e'};
  var poolColors={'us':'var(--us)','tw':'var(--tw)','etf':'var(--ac)'};
  ['us','tw','etf'].forEach(function(p){
    var pItems=selPools[p];
    if(!pItems||!pItems.length)return;
    html+='<div style="font-size:13px;font-weight:700;color:'+poolColors[p]+';margin:16px 0 6px;border-bottom:1px solid '+poolColors[p]+';padding-bottom:4px">'+poolNames[p]+' (\u5165\u9078 '+pItems.length+' \u6a94)</div><div class="sg">';
    pItems.forEach(function(r,rk){
      var col=poolColors[p], rbg='var(--sf2)';
      html+='<div class="scard" style="border-left:3px solid '+col+'"><div class="shdr"><div><div class="scode" style="color:'+col+'">'+r.s.c+'</div><div class="sname">'+r.s.n+'</div></div><span class="srank" style="background:'+rbg+';color:'+col+';border:1px solid '+col+'">#'+(rk+1)+'</span></div>';
      html+='<div class="sscore">'+(r.score>=0?'+':'')+r.score.toFixed(2)+'</div><div class="sbars">';
      [['Mom',r.zm,'var(--tw)'],['Bias',r.zb,'var(--bl)'],['Slope',r.zs,'var(--te)'],['Vol',r.zv,'var(--ye)'],['Kbar',r.zk,'var(--ac)']].forEach(function(b){
        if(b[1]===null)return;
        var w=Math.round(Math.min(100,Math.abs(b[1])*25));
        html+='<div class="sbrow"><span style="width:32px">'+b[0]+'</span><div class="sbwrap"><div class="sbfill" style="width:'+w+'%;background:'+b[2]+'"></div></div><span style="width:36px;text-align:right;font-family:monospace">'+zf(b[1])+'</span></div>';
      });
      html+='</div><div style="margin-top:5px;font-size:10px;color:var(--mu);font-family:monospace">R240:'+pf(r.r240)+'</div>'+renderSignalPriceLine(r.s.c,date,1,sigN)+'</div>';
    });
    html+='</div>';
  });
  if(!sel.length) html+='<div style="color:var(--ye);font-size:12px;margin-bottom:9px">\u7121\u6a19\u7684\u901a\u904e TS \u8207\u5b63\u7dda\u9580\u6ebb - \u5168\u6578\u6301\u6709\u73fe\u91d1</div>';
  $('sigContent').innerHTML=html;
}

function renderST(all,hurdle,selectedCodes,rejectedMap,scoreM) {
  $('stCard').classList.remove('hidden');
  var zf=function(v){return (v!==null?(v>=0?'+':'')+v.toFixed(2):'-');};
  var pf=function(v){return (v!==null?(v>=0?'+':'')+(v*100).toFixed(1)+'%':'-');};
  var html='';
  ['tw','us','etf'].forEach(function(pKey){
    var pStocks=all.filter(function(r){return r.s.pool===pKey;}).sort(function(a,b){return b.score-a.score;});
    if(!pStocks.length)return;
    html+='<tr><td colspan="12" style="background:var(--sf2);color:var(--tx);font-weight:700;text-align:center;padding:8px;">'+pKey.toUpperCase()+' \u7af6\u722d\u6392\u884c</td></tr>';
    pStocks.forEach(function(r,i){
      var isSel=selectedCodes.indexOf(r.s.c)!==-1;
      var reason=rejectedMap[r.s.c]||'\u540d\u6b21\u9760\u5f8c';
      var status=isSel?'<span style="color:var(--gr)">\u2605 \u5165\u9078</span>':'<span style="color:var(--mu);font-size:11px">'+reason+'</span>';
      html+='<tr><td>'+(i+1)+'</td><td style="color:'+(r.s.tw?'var(--tw)':'var(--us)')+'">'+r.s.c+'</td><td>'+r.s.n+'</td><td>'+status+'</td><td>'+zf(r.score)+'</td><td>'+zf(r.zm)+'</td><td>'+zf(r.zb)+'</td><td>'+zf(r.zs)+'</td><td>'+zf(r.zv)+'</td><td>'+zf(r.zk)+'</td><td style="color:'+(r.r240>hurdle?'var(--gr)':'var(--re)')+'">'+pf(r.r240)+'</td><td>'+(isStrictTechnicalPass(r.s.c,scoreM)?'Y':'N')+'</td></tr>';
    });
  });
  $('stBody').innerHTML=html;
}
// Stress-test functions removed in FAST BACKTEST build.

window.onload = function() {
  renderPool();
  initGroupToggles();
  togglePoolUI();

  // 啟動時不自動從 IndexedDB 載入快取。
  // 目的：避免舊 DAILY / RAW_SCORES 污染 WF、Rolling WF、T-N Sweep 結果。
  DAILY = {};
  RAW_SCORES = {};
  CACHE_BUILT = false;
  CACHE_TS = null;
  CACHE_SKIP_MO = false;

  updFetchStat();
  updTNX();
  sl('dlLog', 'Clean start：已停用啟動自動快取載入，請手動抓取或 JSON 還原。', true);
  console.log('[INIT] clean start: IndexedDB auto-load disabled.');
};
