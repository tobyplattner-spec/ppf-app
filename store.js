/* Plattner Peonies & Farmstead — the one seam.
   The app sits on top of this file and nothing else. It knows where the records live
   and how to get them back; it knows nothing whatever about peonies.

   The records are farm-data.json in a private repository, and the photographs are
   files in photos/ beside it, one to a cultivar. A repository rather than a folder
   because a phone cannot be handed a folder, but it can always be handed a URL — and
   because every save then lands as a commit, which is a complete history of the farm
   for free, and an undo for a bad afternoon.

     github — the records in the repository. Reads and writes them in place.
              This is the app: the only way the records are ever written.
     served — the file is simply sitting next to this page. Read-through.
     picked — you chose farm-data.json yourself, out of Files or Drive. Read-through.

   The two read-through modes are the way in before the repository is connected, and
   nothing else. In them, and in github mode with no signal, every edit is written into
   this browser's own storage the moment it is made, so a locked screen or a walk out of
   range can never lose an afternoon's work. What is owed goes back the moment there is
   a way to send it. */

/* Which copy of this file is actually running. Printed on the way-in screen, because
   a browser holding yesterday's copy behind a cache looks exactly like a bug in
   today's, and the two are otherwise impossible to tell apart from a phone.

   Two things carry a version now and they do different jobs: this one is what the app
   says about itself, and CACHE in sw.js is what actually empties a stale shell. There
   used to be a third and a fourth — ?v= on the script tag in each face — which had to
   be kept in step by hand and were not. The worker asks the network first for anything
   on this origin, so the query string was only ever belt over braces. */
const BUILD = "6";

/* ---------- this browser's own shelf ---------- */
const IDB = {
  db:null,
  open(){ return new Promise((res,rej)=>{ if(IDB.db) return res(IDB.db);
    const r=indexedDB.open("ppf-farm",1);
    r.onupgradeneeded=()=>r.result.createObjectStore("kv");
    r.onsuccess=()=>{IDB.db=r.result;res(IDB.db)}; r.onerror=()=>rej(r.error); }); },
  async get(k){ const db=await IDB.open(); return new Promise((res,rej)=>{ const r=db.transaction("kv").objectStore("kv").get(k); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); },
  async set(k,v){ const db=await IDB.open(); return new Promise((res,rej)=>{ const r=db.transaction("kv","readwrite").objectStore("kv").put(v,k); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error); }); },
  async del(k){ const db=await IDB.open(); return new Promise((res,rej)=>{ const r=db.transaction("kv","readwrite").objectStore("kv").delete(k); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error); }); },
  async keys(){ const db=await IDB.open(); return new Promise((res,rej)=>{ const r=db.transaction("kv").objectStore("kv").getAllKeys(); r.onsuccess=()=>res(r.result||[]); r.onerror=()=>rej(r.error); }); }
};

/* ---------- names and shapes ---------- */
const DATA_FILE = "farm-data.json";
const PHOTO_DIR = "photos";

/* ---------- which set of books is open ---------- */
/* One repository, two sets of records: the farm's own, and a sandbox to poke at where
   nothing you do matters. They are separate files with separate photograph directories,
   and everything this browser keeps on their behalf is separate too — what is cached,
   and above all what is owed. An edit made to one out of range must never be sent home
   to the other, which is the whole reason the keys below carry the book's name.

   The farm keeps the plain unprefixed keys it has always had, so a phone that has been
   using this app finds its cache and its unsent edits exactly where it left them. */
const BOOKS = {
  farm:    { data: DATA_FILE,          photos: PHOTO_DIR,      label: "Farm records",
             commit: "Farm records" },
  sandbox: { data: "sandbox-data.json", photos: "sandbox-photos", label: "Sandbox",
             commit: "Sandbox" },
};
let BOOK = "farm";
const book      = () => BOOKS[BOOK] || BOOKS.farm;
const dataFile  = () => book().data;
const photoDir  = () => book().photos;
/* The farm's keys are the bare names; anything else is prefixed. */
const bookKey   = base => BOOK === "farm" ? base : base + ":" + BOOK;
const PHOTO_MIME = "image/jpeg";   /* "image/webp" here is ~30% smaller at the same quality */
const PHOTO_EXT = ".jpg";

const photoFile = v => v.id + PHOTO_EXT;
const photoRef = v => photoDir() + "/" + photoFile(v);
const isInline = p => typeof p === "string" && p.startsWith("data:");
const hasPhotoRef = p => typeof p === "string" && p.length > 0;

/* Decoded by hand rather than through fetch(), which a file:// page cannot always
   use on a data: URL. */
function dataUrlToBlob(s){
  const c = s.indexOf(","), head = s.slice(0, c);
  const mime = (head.match(/data:([^;]+)/) || [,"application/octet-stream"])[1];
  const bin = atob(s.slice(c + 1));
  const buf = new Uint8Array(bin.length);
  for(let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return new Blob([buf], {type:mime});
}
function blobToDataUrl(blob){
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}

/* Base64 both ways. The records go over the wire as base64 and come back the same,
   and a cultivar named Kansas or Käthe has to survive the round trip, so the text is
   walked as bytes rather than as characters. Long photographs are chunked because
   apply() on a hundred thousand arguments is a stack overflow, not a picture. */
const b64ToBytes = b64 => {
  const bin = atob(String(b64).replace(/\s+/g, ""));
  const out = new Uint8Array(bin.length);
  for(let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const bytesToB64 = bytes => {
  let s = "";
  const CH = 0x8000;
  for(let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(s);
};
const textToB64 = t => bytesToB64(new TextEncoder().encode(t));
const b64ToText = b => new TextDecoder().decode(b64ToBytes(b));

/* ---------- the repository ---------- */
/* A fine-grained token, allowed to read and write the contents of one private
   repository and nothing else in the world. It lives in this browser's storage and
   never in the app, which is why the app itself can sit in a public repository. */
class GitError extends Error {
  constructor(msg, status, kind){ super(msg); this.name = "GitError"; this.status = status; this.kind = kind || "error"; }
}
const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;

const Git = {
  cfg:null,

  async loadConfig(){
    if(Git.cfg) return Git.cfg;
    const c = await IDB.get("github");
    Git.cfg = (c && c.owner && c.repo && c.token) ? c : null;
    return Git.cfg;
  },
  async setConfig(c){
    const cfg = { owner:c.owner.trim(), repo:c.repo.trim(), branch:(c.branch||"main").trim(), token:c.token.trim() };
    Git.cfg = cfg;
    await IDB.set("github", cfg);
    return cfg;
  },
  async forgetConfig(){ Git.cfg = null; await IDB.del("github"); },
  get configured(){ return !!Git.cfg; },
  get label(){ return Git.cfg ? Git.cfg.owner + "/" + Git.cfg.repo : null; },

  path(p){ return p.split("/").map(encodeURIComponent).join("/"); },
  url(p){ return `https://api.github.com/repos/${Git.cfg.owner}/${Git.cfg.repo}/contents/${Git.path(p)}`; },

  async req(url, opt = {}){
    if(!Git.cfg) throw new GitError("Not connected to a repository", 0, "unconfigured");
    let r;
    try{
      r = await fetch(url, Object.assign({}, opt, { headers: Object.assign({
        "Authorization": "Bearer " + Git.cfg.token,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
      }, opt.headers || {}) }));
    }catch(e){
      /* No signal, aeroplane mode, a dead spot behind the barn. Not a failure of the
         records — only of the moment — so it is named as such and the caller keeps
         what it has. */
      throw new GitError("No connection", 0, "offline");
    }
    if(r.status === 404) return null;
    if(r.status === 401 || r.status === 403){
      const rem = r.headers.get("x-ratelimit-remaining");
      if(rem === "0") throw new GitError("GitHub is rate limiting this token — try again shortly", r.status, "ratelimit");
      throw new GitError("The token was refused — check it has Contents: read and write on this repository", r.status, "auth");
    }
    if(r.status === 409 || r.status === 422) throw new GitError("The file changed since it was read", r.status, "conflict");
    if(!r.ok){
      let msg = r.statusText;
      try{ const j = await r.json(); if(j && j.message) msg = j.message; }catch(e){}
      throw new GitError(msg, r.status, "error");
    }
    return r;
  },

  /* The records: small, so they come back as base64 in the envelope that also carries
     the sha, and one round trip does for both. */
  async getText(path){
    const r = await Git.req(Git.url(path) + "?ref=" + encodeURIComponent(Git.cfg.branch));
    if(!r) return null;
    const j = await r.json();
    return { text: b64ToText(j.content || ""), sha: j.sha };
  },
  /* A photograph: asked for as itself rather than as base64, since a picture has no
     business being a string. What comes back is only the bytes — the sha of a file is
     asked for separately, and only when something is about to be written over it,
     because an ETag is not a blob sha and treating it as one fails at the worst
     possible moment. */
  async getBlob(path){
    const r = await Git.req(Git.url(path) + "?ref=" + encodeURIComponent(Git.cfg.branch),
      { headers: { "Accept": "application/vnd.github.raw" } });
    if(!r) return null;
    return { blob: await r.blob() };
  },
  /* Putting something back. The sha of what was read comes along, so two devices
     writing at once is caught by GitHub rather than by luck. */
  async put(path, b64, sha, message){
    const body = { message: message || ("Update " + path), content: b64, branch: Git.cfg.branch };
    if(sha) body.sha = sha;
    const r = await Git.req(Git.url(path), { method:"PUT", body: JSON.stringify(body) });
    /* req() answers null for a 404, and a 404 on the way *in* is a write that cannot
       land: a token that has lost Contents write, or a branch renamed out from under
       this device. Every other call here checks for it; this one used to read .json()
       off the null and raise a TypeError with no kind on it, so the app printed that
       instead of the one message it already has for exactly this. */
    if(!r) throw new GitError("Could not write to " + Git.label + " — check the token still has " +
      "Contents: read and write on this repository, and that the " + Git.cfg.branch +
      " branch is still there.", 404, "auth");
    const j = await r.json();
    return j.content ? j.content.sha : null;
  },
  async del(path, sha, message){
    if(!sha){
      sha = await Git.shaOf(path);
      if(!sha) return;                       /* already gone */
    }
    await Git.req(Git.url(path), { method:"DELETE", body: JSON.stringify({
      message: message || ("Remove " + path), sha, branch: Git.cfg.branch }) });
  },
  /* What the repository says about itself. A 404 here does not mean "no such
     repository" — GitHub answers 404 rather than 403 for anything a token cannot see,
     so a repository that exists but was left off the token's list looks exactly like
     one that was never created. Both are named in the same breath because from out
     here they cannot be told apart. */
  async about(){
    const r = await Git.req(`https://api.github.com/repos/${Git.cfg.owner}/${Git.cfg.repo}`);
    if(!r) return null;
    const j = await r.json();
    return { branch: j.default_branch || "main", private: !!j.private, name: j.full_name };
  },

  /* Only the sha, to find out whether anyone else has written since. */
  async shaOf(path){
    const r = await Git.req(Git.url(path) + "?ref=" + encodeURIComponent(Git.cfg.branch));
    if(!r) return null;
    const j = await r.json();
    return j.sha;
  }
};

/* ---------- the photographs ---------- */
const Photos = {
  base:null, git:false, urls:new Map(), missing:new Set(), shas:new Map(),

  /* Served mode: photos/ is just a path next to the page. Read only. */
  mountWeb(){ Photos.git = false; Photos.base = new URL("./", location.href).href; },
  /* Repository mode: photos/ is a directory of files reached over the wire, and kept
     on this device afterwards so the app opens instantly and works out of range. */
  mountGit(){ Photos.base = null; Photos.git = true; },
  /* Picked mode: nowhere to put a file — every circle falls back to its drawing until a
     new photograph is taken, and that one is carried inside the records themselves. */
  mountNone(){ Photos.base = null; Photos.git = false; },

  /* What the circle should show, or nothing. A record pointing at a file that is not
     there falls back to the drawing rather than a broken picture. */
  url(v){
    const held = Photos.urls.get(v.id);
    if(held) return held;
    /* A photograph taken with no signal rides inside the record until it can be
       lifted out into a file of its own. */
    if(isInline(v.photo)) return v.photo;
    return null;
  },

  /* One-time lift out of the old shape: an inline photo becomes a file of its own and
     the record keeps only the path to it. Read-through modes cannot write, so they
     leave the records exactly as they are. */
  async adopt(db){
    if(!Photos.git) return 0;
    let n = 0;
    for(const v of (db.cultivars || [])){
      if(!isInline(v.photo)) continue;
      try{ await Photos.write(v, dataUrlToBlob(v.photo)); n++; }
      catch(e){ if(e.kind !== "offline") throw e; }   /* out of range: it waits in the record */
    }
    return n;
  },

  /* Opened together rather than one after another — forty reads in a row is forty
     rounds of waiting before the app appears. */
  async loadAll(db){
    Photos.clear();
    const want = (db.cultivars || []).filter(v => hasPhotoRef(v.photo) && !isInline(v.photo));
    if(Photos.git){
      await Promise.all(want.map(v => Photos.fromGit(v)));
    }else if(Photos.base){
      /* Served: the picture is at a plain URL, so it is loaded once to find out
         whether it is really there. Only the ones that answer are kept. */
      await Promise.all(want.map(v => new Promise(res => {
        const src = new URL(v.photo, Photos.base).href;
        const im = new Image();
        im.onload  = () => { Photos.urls.set(v.id, src); res(); };
        im.onerror = () => { Photos.missing.add(v.id); res(); };
        im.src = src;
      })));
    }else{
      for(const v of want) Photos.missing.add(v.id);
    }
    return Photos.urls.size;
  },

  /* This device's own copy of a picture, so that the second opening of the app costs
     nothing and the hundredth works with no signal at all. */
  cacheKey: v => bookKey("photo") + ":" + v.id,
  async cached(v){ return IDB.get(Photos.cacheKey(v)); },
  async keep(v, blob, sha){ await IDB.set(Photos.cacheKey(v), { blob, sha, path: v.photo, at: Date.now() }); },
  async drop(v){ await IDB.del(Photos.cacheKey(v)); },

  async fromGit(v){
    const c = await Photos.cached(v).catch(() => null);
    if(c && c.blob && c.path === v.photo){
      Photos.hold(v, URL.createObjectURL(c.blob));
      if(c.sha) Photos.shas.set(v.id, c.sha);
      return true;
    }
    try{
      const got = await Git.getBlob(v.photo);
      if(!got){ Photos.missing.add(v.id); return false; }
      Photos.hold(v, URL.createObjectURL(got.blob));
      await Photos.keep(v, got.blob, null);
      return true;
    }catch(e){
      Photos.missing.add(v.id);
      return false;
    }
  },

  /* Writes the picture, then points the record at it — as a file wherever there is
     somewhere to put one, and inside the record itself where there is not. */
  async write(v, blob){
    if(Photos.git){
      const path = photoRef(v);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const b64 = bytesToB64(bytes);
      /* Held on this device first. If the wire is down the picture is still safe and
         still shows, and the sending of it joins the queue. */
      v.photo = path;
      Photos.hold(v, URL.createObjectURL(blob));
      await Photos.keep(v, blob, Photos.shas.get(v.id) || null);
      try{
        /* Writing over a picture needs the sha of the one already there. A sha handed
           back by an earlier write is trustworthy; otherwise it is asked for, and a
           404 simply means this is the first photograph of this cultivar. */
        let sha = Photos.shas.get(v.id);
        if(sha === undefined) sha = await Git.shaOf(path);
        const put = await Git.put(path, b64, sha || null, "Photograph of " + (v.name || v.id));
        if(put){ Photos.shas.set(v.id, put); await Photos.keep(v, blob, put); }
      }catch(e){
        if(e.kind === "conflict"){
          /* Someone replaced this picture elsewhere; take their sha and put ours over
             it, since a photograph has no merge and the old one is still in history. */
          const sha = await Git.shaOf(path).catch(() => null);
          const put = await Git.put(path, b64, sha, "Photograph of " + (v.name || v.id));
          if(put) Photos.shas.set(v.id, put);
        }else if(e.kind === "offline"){
          await Outbox.queuePhoto(v.id, path, b64);
        }else throw e;
      }
    }else{
      Photos.hold(v, null);
      v.photo = await blobToDataUrl(blob);
    }
    Photos.missing.delete(v.id);
    return v.photo;
  },

  async remove(v){
    const path = hasPhotoRef(v.photo) && !isInline(v.photo) ? v.photo : photoRef(v);
    if(Photos.git){
      await Photos.drop(v).catch(() => {});
      try{ await Git.del(path, Photos.shas.get(v.id) || null, "Remove photograph " + path); }
      catch(e){ if(e.kind === "offline") await Outbox.queuePhoto(v.id, path, null); }
      Photos.shas.delete(v.id);
    }
    Photos.hold(v, null);
    v.photo = null; v.photoCrop = null;
  },

  /* One live blob URL per cultivar; the one it replaces is handed back to the browser.
     A plain http URL passed to revokeObjectURL is simply ignored, so served mode can
     share the same shelf without a second code path. */
  hold(v, url){
    const old = Photos.urls.get(v.id);
    if(old) URL.revokeObjectURL(old);
    if(url) Photos.urls.set(v.id, url); else Photos.urls.delete(v.id);
  },
  clear(){
    for(const u of Photos.urls.values()) URL.revokeObjectURL(u);
    Photos.urls.clear(); Photos.missing.clear();
  }
};

/* ---------- what is owed ---------- */
/* Everything that was done out of range and has not been sent yet. The records are
   one entry because only the latest matters; photographs are one entry each because
   they are separate files and each stands alone. */
const Outbox = {
  async read(){ return (await IDB.get(bookKey("outbox"))) || { data:null, photos:{} }; },
  async write(o){ await IDB.set(bookKey("outbox"), o); },

  async queueData(text){
    const o = await Outbox.read();
    o.data = { text, at: Date.now() };
    await Outbox.write(o);
  },
  async queuePhoto(id, path, b64){
    const o = await Outbox.read();
    o.photos = o.photos || {};
    o.photos[id] = { path, b64, at: Date.now() };   /* b64 null means: delete it */
    await Outbox.write(o);
  },
  /* How much is still owed: the records count as one, and each photograph as itself. */
  async pending(){
    const o = await Outbox.read();
    return (o.data ? 1 : 0) + Object.keys(o.photos || {}).length;
  },
  async clear(){ await IDB.set(bookKey("outbox"), { data:null, photos:{} }); }
};

/* ---------- the store ---------- */
const Store = {
  mode:null,                    /* "github" | "served" | "picked" */
  label:null,
  sha:null,                     /* what the records looked like when we last agreed */
  unsent:false,                 /* edits are safe here but not yet where they belong */
  lastSync:null,
  servedCapable: typeof location !== "undefined" && (location.protocol === "http:" || location.protocol === "https:"),

  get ready(){ return Store.mode !== null; },

  /* ---- the two sets of books ---- */
  get book(){ return BOOK; },
  get books(){ return BOOKS; },
  get isSandbox(){ return BOOK === "sandbox"; },
  bookLabel(){ return book().label; },
  /* Which one was open last, remembered so the app comes back where you left it. A
     name this browser does not recognise falls back to the farm rather than to
     nothing, since the farm is the one that matters. */
  async loadBook(){
    const b = await IDB.get("book");
    BOOK = (b && BOOKS[b]) ? b : "farm";
    return BOOK;
  },
  /* The other book has to actually be reachable to be worth offering. In the repository
     it is a second file in the same repository; served, a second file beside the page.
     A file you handed the app yourself is the only file it has, so there is nothing to
     change to. */
  get canSwitchBooks(){
    return Store.mode === "github" || Store.mode === "served";
  },
  /* Change books and hand back the other one's records. Whatever the book being left
     still owes stays owed on its own shelf, and goes home the next time it is open. */
  async openBook(b){
    if(!BOOKS[b]) throw new Error("No such set of books: " + b);
    await Store.setBook(b);
    if(Store.mode === "served") return Store.openServed();
    return Store.load();
  },

  /* Everything Store holds about a file — what it looked like when we last agreed, and
     whether anything is owed — is about the book that was open, so all of it is dropped
     rather than carried across. What is owed by the other book is on its own shelf and
     is still owed; it goes home the next time that book is open. The caller reloads. */
  async setBook(b){
    if(!BOOKS[b] || b === BOOK) return BOOK;
    BOOK = b;
    await IDB.set("book", b);
    Store.sha = null;
    Store.unsent = false;
    Store.lastSync = null;
    Store._first = null;
    if(Store.mode === "github"){ Store.label = Git.label; Photos.mountGit(); }
    /* Both of these are keyed by cultivar id alone, and the two books can name a
       cultivar the same thing — so they are emptied rather than reached into. */
    Photos.clear();
    Photos.shas.clear();
    return BOOK;
  },
  /* The repository puts the edit where it actually belongs rather than parking it. */
  get writesInPlace(){ return Store.mode === "github"; },
  get isRepo(){ return Store.mode === "github"; },
  name(){ return Store.label; },

  /* ---- the repository ---- */
  async connectRepo(cfg){
    await Git.setConfig(cfg);
    /* Nothing is remembered until it has been proved to work, and it is proved in two
       steps so that the answer can say which one failed. A token typed with a character
       missing must not still be here tomorrow, quietly failing. */
    const where = cfg.owner + "/" + cfg.repo;
    let got;
    try{
      const about = await Git.about();
      if(!about){
        await Git.forgetConfig();
        throw new GitError("Cannot see " + where + ". Either the name is spelt differently, or the " +
          "token was not given access to that repository \u2014 open the token and check Repository " +
          "access lists " + cfg.repo + ".", 404, "norepo");
      }
      /* Whatever the branch is actually called. A repository made years ago is on
         master, a new one on main, and guessing wrong looks exactly like a missing
         file. */
      if(about.branch !== Git.cfg.branch) await Git.setConfig({ ...Git.cfg, branch: about.branch });

      got = await Git.getText(dataFile());
      if(!got){
        await Git.forgetConfig();
        throw new GitError(where + " is there, but there is no " + dataFile() + " in the root of its " +
          about.branch + " branch. Check the upload committed, and that the name is exactly " +
          dataFile() + ".", 404, "missing");
      }
    }catch(e){
      await Git.forgetConfig();
      throw e;
    }
    Store.mode = "github";
    Store.label = Git.label;
    Store.sha = got.sha;
    Store.unsent = false;
    Store.lastSync = Date.now();
    Photos.mountGit();
    Store._first = got.text;
    return true;
  },
  async restoreRepo(){
    const cfg = await Git.loadConfig();
    if(!cfg) return false;
    Store.mode = "github";
    Store.label = Git.label;
    Photos.mountGit();
    return true;
  },
  async disconnectRepo(){
    await Git.forgetConfig();
    await Outbox.clear();
    Store.mode = null; Store.label = null; Store.sha = null; Store.unsent = false;
  },

  /* What was open last time. The repository is the only way the records are ever
     written, so it is the only thing there is to come back to. */
  async restore(){
    /* Which book before which file: everything below reads from the one that is open. */
    await Store.loadBook();
    return Store.restoreRepo();
  },

  /* ---- served: the file is simply next door ---- */
  async openServed(){
    const r = await fetch(dataFile(), {cache:"no-store"});
    if(!r.ok) throw new Error(dataFile() + " not found beside this page");
    const db = JSON.parse(await r.text());
    Store.mode = "served";
    Store.label = dataFile();
    Store.unsent = false;
    Photos.mountWeb();
    return db;
  },

  /* ---- picked: you handed it the file yourself ---- */
  async openPicked(file){
    const db = JSON.parse(await file.text());
    Store.mode = "picked";
    Store.label = file.name || dataFile();
    Store.unsent = false;
    Photos.mountNone();
    return db;
  },

  /* ---- what was open last time, kept in this browser ---- */
  async cached(){
    const c = await IDB.get(bookKey("cache"));
    if(!c || !c.text) return null;
    return c;
  },
  async openCached(c){
    const db = JSON.parse(c.text);
    Store.mode = c.mode || "picked";
    Store.label = c.label || dataFile();
    Store.unsent = !!c.unsent;
    Store.sha = c.sha || null;
    if(Store.mode === "github"){ await Git.loadConfig(); Photos.mountGit(); }
    else if(Store.mode === "served" && Store.servedCapable) Photos.mountWeb();
    else Photos.mountNone();
    return db;
  },

  /* ---------- reading ---------- */
  /* The repository is the only place the records are read from and written to, so this
     is the whole of it. Served and picked hand their records straight back from their
     own openers and never come through here. */
  async load(){
    let text, sha;
    if(Store._first){ text = Store._first; sha = Store.sha; Store._first = null; }
    else{
      try{
        const got = await Git.getText(dataFile());
        if(!got) throw new GitError("No " + dataFile() + " in " + Git.label, 404, "missing");
        text = got.text; sha = got.sha;
        Store.lastSync = Date.now();
      }catch(e){
        /* Out of range on the way in: what this device last held is the farm as far
           as it knows, and the edits owed are still owed. */
        if(e.kind !== "offline") throw e;
        const c = await Store.cached();
        if(!c) throw e;
        const db = JSON.parse(c.text);
        Store.sha = c.sha || null;
        Store.unsent = !!c.unsent;
        await Photos.loadAll(db);
        return db;
      }
    }
    /* An edit made out of range outranks the copy on the wire — it is newer, and it
       is the only copy of that afternoon. */
    const owed = await Outbox.read();
    if(owed.data && owed.data.text){ text = owed.data.text; Store.unsent = true; }
    Store.sha = sha;
    const db = JSON.parse(text);
    const moved = await Photos.adopt(db);
    await Photos.loadAll(db);
    await Store.keepLocal(text);
    if(moved){
      await Store.save(db);
      Store.say(moved + " photograph" + (moved === 1 ? "" : "s") + " lifted into " + photoDir() + "/");
    }
    Store.flush().catch(() => {});   /* what is owed goes now, quietly */
    return db;
  },

  /* ---------- writing ---------- */
  /* A save means "put this where it cannot be lost". With the repository that is the
     file itself; without it this browser's own storage, and the trip home is the share
     sheet, which only a tap of yours can open. */
  async save(data){
    const text = JSON.stringify(data, null, 2);

    if(Store.mode === "github"){
      await Store.keepLocal(text);            /* safe on this device before anything else */
      try{
        const sha = await Git.put(dataFile(), textToB64(text), Store.sha, Store.message(data));
        Store.sha = sha;
        Store.unsent = false;
        Store.lastSync = Date.now();
        await Store.keepLocal(text);
        const o = await Outbox.read(); o.data = null; await Outbox.write(o);
        return;
      }catch(e){
        if(e.kind === "offline"){
          Store.unsent = true;
          await Outbox.queueData(text);
          return;                              /* not a failure; a postponement */
        }
        if(e.kind === "conflict"){
          Store.unsent = true;
          await Outbox.queueData(text);
          throw e;                             /* the app has to ask you which one wins */
        }
        Store.unsent = true;
        await Outbox.queueData(text);
        throw e;
      }
    }

    /* read-through */
    Store.unsent = true;
    await IDB.set(bookKey("cache"), { text, at: Date.now(), label: Store.label, mode: Store.mode, unsent: true });
  },

  /* Yours wins. The one being written over is still in the history, so this is a
     choice and not a loss. */
  async forceSave(data){
    const text = JSON.stringify(data, null, 2);
    const cur = await Git.shaOf(dataFile());
    const sha = await Git.put(dataFile(), textToB64(text), cur, Store.message(data) + " (over a newer copy)");
    Store.sha = sha;
    Store.unsent = false;
    Store.lastSync = Date.now();
    await Store.keepLocal(text);
    const o = await Outbox.read(); o.data = null; await Outbox.write(o);
  },
  /* Theirs wins: throw this device's version away and take what is on the wire. */
  async reload(){
    const got = await Git.getText(dataFile());
    if(!got) throw new GitError("No " + dataFile() + " in " + Git.label, 404, "missing");
    Store.sha = got.sha;
    Store.unsent = false;
    Store.lastSync = Date.now();
    /* The conflict is about the records, and only the records. A photograph waiting in
       the outbox is a file of its own with nothing to conflict with, so taking the newer
       copy of farm-data.json is no reason to drop it: clearing the whole outbox here
       lost the picture quietly, since the blob stays cached and the phone goes on
       showing one that never reached the repository. */
    const o = await Outbox.read(); o.data = null; await Outbox.write(o);
    await Store.keepLocal(got.text);
    const db = JSON.parse(got.text);
    await Photos.loadAll(db);
    return db;
  },

  message(data){
    const n = (data && data.plants ? data.plants.length : 0);
    const when = new Date().toLocaleString("en-US", { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" });
    return book().commit + " — " + when + (n ? " (" + n + " plants)" : "");
  },
  say(msg){ if(typeof window !== "undefined" && typeof window.toast === "function") setTimeout(() => window.toast(msg), 400); },

  async keepLocal(text){
    await IDB.set(bookKey("cache"), { text, at: Date.now(), label: Store.label, mode: Store.mode,
      unsent: Store.unsent, sha: Store.sha });
  },

  /* ---------- catching up ---------- */
  /* Everything owed, sent in one go. Called when the signal comes back, when the app
     is picked up again, and after every successful save. */
  async flush(){
    if(Store.mode !== "github" || isOffline()) return 0;
    const o = await Outbox.read();
    let sent = 0;

    for(const [id, p] of Object.entries(o.photos || {})){
      try{
        if(p.b64 === null || p.b64 === undefined) await Git.del(p.path, null, "Remove photograph " + p.path);
        else await Git.put(p.path, p.b64, await Git.shaOf(p.path), "Photograph " + p.path);
        delete o.photos[id];
        sent++;
      }catch(e){
        if(e.kind === "offline"){ await Outbox.write(o); return sent; }
        if(e.kind === "conflict"){
          try{
            const sha = await Git.shaOf(p.path);
            if(p.b64) await Git.put(p.path, p.b64, sha, "Photograph " + p.path);
            else if(sha) await Git.del(p.path, sha, "Remove photograph " + p.path);
            delete o.photos[id];
            sent++;
          }catch(e2){ /* leave it owed */ }
        }
        /* anything else: leave it owed rather than lose it */
      }
    }

    if(o.data && o.data.text){
      try{
        const sha = await Git.put(dataFile(), textToB64(o.data.text), Store.sha, Store.message(null) + " (caught up)");
        Store.sha = sha;
        o.data = null;
        Store.unsent = false;
        Store.lastSync = Date.now();
        sent++;
      }catch(e){
        if(e.kind === "conflict"){ await Outbox.write(o); Store.unsent = true; throw e; }
        /* offline or otherwise: it stays owed */
      }
    }

    await Outbox.write(o);
    return sent;
  },

  /* Has anyone else written since we last looked? Cheap enough to ask on every
     return to the app, which is what makes the two devices feel like one. */
  async remoteChanged(){
    if(Store.mode !== "github" || isOffline() || Store.unsent) return false;
    try{
      const sha = await Git.shaOf(dataFile());
      Store.lastSync = Date.now();
      return !!sha && sha !== Store.sha;
    }catch(e){ return false; }
  },

  async forget(){
    await IDB.set(bookKey("cache"), null);
    Store.unsent = false;
  }
};

/* Everything the app needs in order to say, in one line, where its data stands. */
Store.build = BUILD;


if(typeof window !== "undefined"){
  window.IDB = IDB; window.Git = Git; window.Photos = Photos; window.Store = Store; window.Outbox = Outbox;
  window.GitError = GitError; window.BUILD = BUILD;
  /* DATA_FILE and PHOTO_DIR stay the farm's own names, which is what everything
     outside this file has always meant by them; dataFile() and photoDir() are the
     open book's. */
  window.DATA_FILE = DATA_FILE; window.PHOTO_DIR = PHOTO_DIR; window.PHOTO_MIME = PHOTO_MIME; window.PHOTO_EXT = PHOTO_EXT;
  window.BOOKS = BOOKS; window.dataFile = dataFile; window.photoDir = photoDir;
}
if(typeof module !== "undefined" && module.exports){
  module.exports = { IDB, Git, Photos, Store, Outbox, GitError, DATA_FILE, PHOTO_DIR, PHOTO_EXT, PHOTO_MIME,
    BOOKS, dataFile, photoDir,
    photoFile, photoRef, isInline, hasPhotoRef, dataUrlToBlob, blobToDataUrl, b64ToBytes, bytesToB64, textToB64, b64ToText };
}
