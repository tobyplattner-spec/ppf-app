/* The seam, against a repository held in memory.

   Pulls the real store.js in rather than reimplementing it, so it cannot quietly drift
   from the app. A loose file like everything else here — no folder to upload.

       node test-seam.js

   Needs nothing installed. The last section reads index.html as text rather than running
   it: the app needs a browser, so those are source checks and say so. */
const STORE = require("path").join(__dirname, "store.js");

// ---- a tiny IndexedDB standing in for the browser's ----
const shelf = new Map();
global.indexedDB = {
  open(){ const r={}; setTimeout(()=>{ r.result={
    transaction:()=>({ objectStore:()=>({
      get:k=>{const q={};setTimeout(()=>{q.result=shelf.get(k);q.onsuccess&&q.onsuccess()},0);return q},
      put:(v,k)=>{const q={};shelf.set(k,v);setTimeout(()=>q.onsuccess&&q.onsuccess(),0);return q},
      delete:k=>{const q={};shelf.delete(k);setTimeout(()=>q.onsuccess&&q.onsuccess(),0);return q},
      getAllKeys:()=>{const q={};setTimeout(()=>{q.result=[...shelf.keys()];q.onsuccess&&q.onsuccess()},0);return q},
    })})}; r.onsuccess&&r.onsuccess(); },0); return r; }
};
global.navigator = { onLine: true };
global.location  = { protocol: "https:", href: "https://x.test/" };
/* The shelves hand out a blob URL for every picture they hold, which is a browser
   thing. Nothing here looks at what comes back, only that holding one does not throw. */
global.URL.createObjectURL = () => "blob:test";
global.URL.revokeObjectURL = () => {};

// ---- the repository, and what we make it answer ----
let repo, calls;
function reset(){ repo = new Map(); calls = []; }
let putStatus = 200;   // flip to 404 to test the write-refused path

global.fetch = async (url, opt={}) => {
  const method = opt.method || "GET";
  calls.push(method + " " + url);
  const hdr = { get:()=>null };
  const m = /contents\/(.+?)(\?|$)/.exec(url);
  const p = m ? decodeURIComponent(m[1]) : null;

  if(/api\.github\.com\/repos\/[^/]+\/[^/]+$/.test(url))
    return { ok:true, status:200, headers:hdr, json:async()=>({default_branch:"main",private:true,full_name:"o/r"}) };

  if(method === "PUT"){
    if(putStatus === 404) return { ok:false, status:404, headers:hdr, json:async()=>({message:"Not Found"}) };
    const body = JSON.parse(opt.body);
    const sha = "sha" + (repo.size + calls.length);
    repo.set(p, { content: body.content, sha });
    return { ok:true, status:200, headers:hdr, json:async()=>({ content:{ sha } }) };
  }
  if(method === "DELETE"){ repo.delete(p); return { ok:true, status:200, headers:hdr, json:async()=>({}) }; }
  const hit = repo.get(p);
  if(!hit) return { ok:false, status:404, headers:hdr, json:async()=>({message:"Not Found"}) };
  return { ok:true, status:200, headers:hdr, json:async()=>({ content:hit.content, sha:hit.sha }),
           blob:async()=>new Blob([Buffer.from(hit.content,"base64")]) };
};

const S = require(STORE);
const { Store, Git, Outbox, IDB } = S;

let pass=0, fail=0;
const ok=(c,m)=>{ if(c){pass++;console.log("  ok   "+m);} else {fail++;console.log("  FAIL "+m);} };
const b64=t=>Buffer.from(t,"utf8").toString("base64");
const seed=(name,obj)=>repo.set(name,{content:b64(JSON.stringify(obj)),sha:"sha0"});
const FARM={schemaVersion:1,farm:{name:"f"},property:{widthFt:10,depthFt:10,cellFt:3},
  cultivars:[],plants:[],blooms:[],transactions:[]};
const TX={id:7,date:"2026-05-04",direction:"expense",counterparty:"Adelman",
  description:null,amount:20,category:"Books",allocations:[]};
const jpeg=()=>new Blob([Buffer.from("not really a jpeg, but bytes are bytes")]);

(async () => {
console.log("\n-- B: a write refused with 404 reports itself, not a TypeError --");
reset(); shelf.clear();
seed("farm-data.json", FARM);
await Store.connectRepo({owner:"o",repo:"r",token:"t",branch:"main"});
await Store.load();
putStatus = 404;
let err=null;
try{ await Store.save(FARM); }catch(e){ err=e; }
ok(err && err.name === "GitError", "throws a GitError (was TypeError on null)");
ok(err && err.kind === "auth", "carries kind 'auth' so the app can speak to it");
ok(err && /Contents: read and write/.test(err.message), "names the permission to check");
putStatus = 200;

console.log("\n-- D: taking the newer records keeps photographs that never went --");
reset(); shelf.clear();
seed("farm-data.json", FARM);
await Store.connectRepo({owner:"o",repo:"r",token:"t",branch:"main"});
await Store.load();
await Outbox.queuePhoto("rosea","photos/rosea.jpg","AAAA");
await Outbox.queueData(JSON.stringify(FARM));
ok((await Outbox.pending()) === 2, "two things owed before the conflict");
await Store.reload();
const after = await Outbox.read();
ok(after.data === null, "the records the conflict was about are given up");
ok(!!after.photos.rosea, "the photograph is still owed (was silently dropped)");
ok((await Outbox.pending()) === 1, "one thing owed after");

console.log("\n-- A: the two books keep separate shelves --");
reset(); shelf.clear();
seed("farm-data.json", FARM);
seed("sandbox-data.json", {...FARM, farm:{name:"sandbox"}});
await Store.connectRepo({owner:"o",repo:"r",token:"t",branch:"main"});
await Store.load();
await Store.keepLocal(JSON.stringify({who:"farm"}));
await Store.openBook("sandbox");
ok(S.dataFile() === "sandbox-data.json", "the open book names its own file");
await Store.keepLocal(JSON.stringify({who:"sandbox"}));
const farmShelf = JSON.parse((await IDB.get("cache")).text);
const sandShelf = JSON.parse((await IDB.get("cache:sandbox")).text);
ok(farmShelf.who === "farm", "the farm's shelf still holds the farm");
ok(sandShelf.who === "sandbox", "the sandbox has a shelf of its own");
await Store.openBook("farm");

console.log("\n-- E: the two kinds of picture are filed apart --");
reset(); shelf.clear();
seed("farm-data.json", {...FARM, cultivars:[{id:"rosea",name:"Rosea",photo:null}], transactions:[{...TX}]});
seed("sandbox-data.json", {...FARM, farm:{name:"sandbox"}});
await Store.connectRepo({owner:"o",repo:"r",token:"t",branch:"main"});
let db = await Store.load();
ok(S.photoDir() === "photos/cultivars", "a cultivar photograph has a directory of its own");
ok(S.receiptDir() === "photos/receipts", "and a receipt has another");
const tx = db.transactions[0], cv = db.cultivars[0];
await S.Receipts.write(tx, jpeg());
await S.Photos.write(cv, jpeg());
ok(tx.receipt === "photos/receipts/7.jpg", "the transaction points at its receipt by path");
ok(repo.has("photos/receipts/7.jpg"), "and the file is where the path says");
ok(cv.photo === "photos/cultivars/rosea.jpg", "the cultivar points at its photograph");
ok(repo.has("photos/cultivars/rosea.jpg"), "filed nowhere near the receipts");
await S.Receipts.remove(tx);
ok(tx.receipt === null, "removing a receipt clears the record");
ok(!repo.has("photos/receipts/7.jpg"), "and takes the file with it");
ok(repo.has("photos/cultivars/rosea.jpg"), "leaving the photograph alone");

console.log("\n-- F: the sandbox files its receipts under its own roof --");
await Store.openBook("sandbox");
ok(S.receiptDir() === "sandbox-photos/receipts", "the sandbox has its own receipts directory");
ok(S.photoDir() === "sandbox-photos/cultivars", "and its own photographs directory");
await Store.openBook("farm");

console.log("\n-- G: a photograph and a receipt of the same number do not queue over each other --");
reset(); shelf.clear();
await Outbox.clear();
await Outbox.queuePhoto("photo:7", "photos/cultivars/7.jpg", "AAAA", "Photograph");
await Outbox.queuePhoto("receipt:7", "photos/receipts/7.jpg", "BBBB", "Receipt");
ok((await Outbox.pending()) === 2, "both are owed, not one over the other");
seed("farm-data.json", FARM);
await Store.connectRepo({owner:"o",repo:"r",token:"t",branch:"main"});
await Store.flush();
ok(repo.has("photos/cultivars/7.jpg"), "the photograph goes home");
ok(repo.has("photos/receipts/7.jpg"), "and so does the receipt");
ok((await Outbox.pending()) === 0, "and nothing is left owed");

console.log("\n-- folder mode is gone --");
ok(Store.supported === undefined, "Store.supported removed");
ok(Store.state === undefined, "Store.state() removed (was already dead)");
ok(typeof Store.pick !== "function", "Store.pick removed");
ok(Store.writesInPlace === true, "writesInPlace is true in repo mode");

console.log("\n-- app-side fixes (read out of index.html: these are source checks, not runtime) --");
const fs = require("fs");
const app = fs.readFileSync(require("path").join(__dirname, "index.html"),"utf8");
const fn = n => { const i = app.indexOf("function "+n+"("); const j = app.indexOf("\n}", i); return app.slice(i, j); };
const sb = fn("sendBack");
ok(!/IDB\.set\("cache"/.test(sb), "sendBack no longer writes the farm's bare cache key");
ok(/Store\.keepLocal\(text\)/.test(sb), "sendBack keeps through Store.keepLocal (book-aware, proved above)");
ok(!/\bDATA_FILE\b/.test(sb), "sendBack no longer names DATA_FILE");
ok(/const name = dataFile\(\)/.test(sb), "sendBack names the open book's file");
const co = fn("commitOrder");
ok(!/x\.name\.toLowerCase\(\)/.test(co), "commitOrder no longer calls .toLowerCase on a possibly-null name");
ok(/\(x\.name \|\| ""\)\.toLowerCase\(\)/.test(co), "commitOrder guards the name like every other read site");
ok(!/IDB\.set\("cache"|IDB\.set\("outbox"/.test(app), "no bare book keys anywhere in the app");
const tp = fn("takePhoto"), sq = fn("squeezeReceipt");
ok(/drawTo\(img, PHOTO_PX\)/.test(tp), "a bloom is drawn at the size blooms are drawn at");
ok(/encode\(c, PHOTO_Q\)/.test(tp), "and encoded at the quality blooms are kept at");
ok(!/squeezeReceipt|RECEIPT_/.test(tp), "the receipt squeeze never touches a photograph of a bloom");
ok(/RECEIPT_PX = \[1600/.test(app), "a receipt keeps a long edge small print can survive");
ok(/RECEIPT_BUDGET/.test(sq), "and gives away quality against a budget instead");
ok(/return best/.test(sq), "one too busy to fit is still kept, at its smallest");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
})().catch(e => { console.error("HARNESS ERROR:", e); process.exit(2); });
