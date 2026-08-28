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
/* The recording sheet is one panel with three tabs, so it must not change size when
   they are touched — it asks for a height rather than settling for a maximum. */
ok(/tall: true/.test(app), "the recording sheet asks to be full height");
ok(/\.pspanel\.tall\{height:92dvh\}/.test(app), "and tall is a height, not a maximum");
const orderForm = app.slice(app.indexOf("const orderForm ="), app.indexOf("const simpleForm ="));
ok(orderForm.includes("draftReceiptRow()"), "a plant order asks for the receipt inside its own form");
ok(orderForm.indexOf("draftReceiptRow()") < orderForm.indexOf("The roots"),
   "and asks for it above the roots, the way the saved transaction shows it");
ok(!/filed against this entry/.test(app), "the note under the receipt button is gone");
ok(!/Tap to read|Tap to replace/.test(app), "neither thumbnail says read or replace");
ok((app.match(/Tap to view/g) || []).length === 2, "both of them say view instead");

/* Escape shuts the sheet in front, so the order it tests things in has to be the order
   they are stacked in. On the ledger that is receipt, then plant, then transaction. */
const esc = app.slice(app.indexOf('if(e.key !== "Escape") return;'),
                      app.indexOf('window.addEventListener("beforeunload"'));
const at = t => { const i = esc.indexOf(t); return i < 0 ? Infinity : i; };
ok(at("if(receiptFor !== null)") < at("if(draftTxn)"),
   "Escape leaves a receipt before it throws away the draft behind it");
ok(at("if(openPlant !== null)") < at("if(openTxn !== null)"),
   "and leaves a plant before it closes the order behind it");

/* There are two of these — the divisions inside a plant sheet, and the roots on an
   order — and only the second one changed, so this looks inside wireTxnView rather
   than at the first match in the file. */
const wtv = app.slice(app.indexOf("function wireTxnView("), app.indexOf("/* ---------- record an order"));
const gp = wtv.slice(wtv.indexOf('querySelectorAll("[data-goplant]")'));
ok(gp.length > 0, "wireTxnView is where the roots on an order are wired");
ok(!/location\.hash/.test(gp.slice(0, 300)), "a plant on an order does not navigate away from the ledger");
ok(/openPlant = Number/.test(gp.slice(0, 300)), "it opens the plant sheet over the order instead");
ok(/const plantSheetFloats/.test(app), "and one answer decides where closing it leaves you");

console.log("\n-- H: a receipt is a photograph or a PDF, and the seam knows which --");
reset(); shelf.clear();
seed("farm-data.json", {...FARM, transactions:[{...TX}]});
seed("sandbox-data.json", {...FARM});
await Store.connectRepo({owner:"o",repo:"r",token:"t",branch:"main"});
const pdb = await Store.load();
const ptx = pdb.transactions[0];
await S.Receipts.write(ptx, jpeg());
ok(ptx.receipt === "photos/receipts/7.jpg", "a photographed receipt is filed as .jpg");
await S.Receipts.write(ptx, new Blob([Buffer.from("%PDF-1.4 pretend")], {type:"application/pdf"}));
ok(ptx.receipt === "photos/receipts/7.pdf", "a PDF is filed as .pdf, not squeezed into a .jpg name");
ok(repo.has("photos/receipts/7.pdf"), "and the file is there under that name");
ok(!repo.has("photos/receipts/7.jpg"), "the photograph it replaced is taken away, not orphaned");
ok(S.isPdfRef(ptx.receipt) === true, "isPdfRef reads the path");
ok(S.isPdfRef("photos/receipts/7.jpg") === false, "and does not cry PDF over a photograph");
ok(S.isPdfRef("data:application/pdf;base64,AAAA") === true, "including one riding inside the records");
await S.Receipts.remove(ptx);
ok(!repo.has("photos/receipts/7.pdf") && ptx.receipt === null, "and removing takes the PDF with it");

console.log("\n-- app-side: the rest of this batch (source checks) --");
ok(!/Nothing is added until you save[\s\S]{0,80}Record a transaction|Record a transaction[\s\S]{0,120}Nothing is added until you save/.test(app),
   "the recording sheet has no subtitle");
ok(!/id="t-rcDrop"/.test(app), "and no Remove button of its own — the viewer has the only one");
ok(!/markOrder|tvPlantGo|Mark \$\{canPlant\} Planted/.test(app), "marking a whole order planted is gone");
ok(/accept="image\/\*,application\/pdf,\.pdf"/.test(app), "the picker takes a PDF as well as a picture");
ok(/repaintTxnSheet/.test(app), "changing kind repaints the sheet");
const rk = app.slice(app.indexOf("function repaintTxnSheet"), app.indexOf("function wireTxnSheet"));
ok(!/\brender\(\);/.test(rk.replace(/return render\(\);/g, "")),
   "in place, without the full render that made it flinch");
const rcCss = app.slice(app.indexOf(".receiptview{"), app.indexOf(".receiptthumb.doc"));
ok(/touch-action:none/.test(rcCss), "every finger on the receipt box goes to the pinch code");
ok(/overflow:hidden/.test(rcCss), "the box does not scroll, so a drag cannot chain out of it");
ok(/overscroll-behavior:contain/.test(app.slice(app.indexOf(".psbody{"), app.indexOf(".psbody{") + 200)),
   "and no sheet's own scrolling reaches the page behind it");
ok(/function wireReceiptZoom/.test(app), "the viewer pinches and drags");
ok((app.match(/tall: true/g) || []).length === 2, "the recording sheet and the plant sheet are both full height");

/* A sheet is pulled closed by its handle or its header, and nothing behind one moves.
   Both of those are the same fact: the browser must not read a drag on those parts as
   a scroll, because the moment it does it takes the gesture and fires pointercancel. */
const gest = app.slice(app.indexOf("function wireSheetGestures"), app.indexOf("/* ---------- the data sheet"));
ok(/\.pshead\{[^}]*touch-action:none/.test(app), "a drag on the header belongs to the app");
ok(/\.pshandle\{[^}]*touch-action:none/.test(app), "and so does one on the handle");
ok(/pointercancel/.test(gest), "a pull taken away mid-gesture springs back rather than closing");
ok(/setPointerCapture/.test(gest), "a finger that wanders off the header keeps talking to it");
ok(/querySelectorAll\("\.psback"\)/.test(gest) && /e\.preventDefault\(\)/.test(gest),
   "and a drag anywhere on a sheet that is not its body scrolls nothing at all");
ok(/closest\("\.psbody"\)/.test(gest), "the body being the one thing that may still scroll");

/* The map's paper is drawn for the widest the view can ever be, so a pinch outwards
   never runs off the edge of it and waits for the fingers to lift. */
const bm = app.slice(app.indexOf("function baseMapFor"), app.indexOf("function baseMap("));
ok(/fitW \|\| computeFitW\(\)/.test(bm), "the paper is sized by how far out the view can go");
ok(/_baseW !== wide \|\| _baseH !== tall/.test(bm),
   "and cached on its height as well as its width, or the first guess at the pane's shape sticks");

/* A PDF is moved by the same hand as a photograph, rather than left to the reader
   inside its frame — which opened zoomed in, would not go back out, and handed every
   swipe it could not use to the page behind. */
ok(!/receiptview doc/.test(app), "a PDF sits in the same box as a picture, not one of its own");
ok(!/\.receiptview\.doc\{/.test(app), "and the box that let its frame take the touches is gone");
ok(/\.receiptview iframe\{[^}]*transform-origin/.test(app), "the frame is pushed about by the same transform");
ok(/\.receiptview iframe\{[^}]*pointer-events:none/.test(app), "and takes no touches of its own");
ok(/\.receiptview \.grab\{/.test(app), "something of ours is laid over it for the fingers to land on");
ok(/const RC_DOC/.test(app), "the frame is given a page-sized canvas, since it has no size to offer");
const rz = app.slice(app.indexOf("function wireReceiptZoom"), app.indexOf("/* ---------- recording one"));
ok(/fixed \? fixed\.w : img\.naturalWidth/.test(rz), "one zoom serves a picture and a frame alike");
ok(/addEventListener\("touchmove", e => e\.preventDefault\(\)/.test(rz),
   "and nothing begun inside the box scrolls anything, whatever it lands on");

/* Nothing in front of the user explains how any of it works. */
ok(!/squeezed on the way in|kept for good|A PDF, kept whole|A PDF out of Files/.test(app),
   "no blurb about squeezing or about what is done with a PDF");
ok((app.match(/Pinch to zoom, drag to move/g) || []).length === 1,
   "one hint, and it serves both kinds");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
})().catch(e => { console.error("HARNESS ERROR:", e); process.exit(2); });
