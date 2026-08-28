/* Plattner Peonies & Farmstead — the one seam.
   The app sits on top of this file and nothing else. It knows where the records live
   and how to get them back; it knows nothing whatever about peonies.

   The records are farm-data.json in a private repository, and the pictures are files
   in photos/ beside it — a photograph of each cultivar in photos/cultivars/, and the
   receipt for a transaction in photos/receipts/. A repository rather than a folder
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
const BUILD = "14";

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
/* Two kinds of picture are kept, and they want different things. A cultivar's
   photograph is there for the look of the thing and is left as sharp as it came. A
   receipt is there to be read, so it is squeezed hard on the way in — small print
   survives a great deal of squeezing, and a shoebox of receipts should not outweigh
   the farm. They are told apart by the directory they sit in rather than by the name
   of the file, so a folder listing says which is which. */
const CULTIVAR_SUB = "cultivars";
const RECEIPT_SUB  = "receipts";

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
const book       = () => BOOKS[BOOK] || BOOKS.farm;
const dataFile   = () => book().data;
/* The root the two kinds of picture share, and one directory each beneath it. */
const pictureDir = () => book().photos;
const photoDir   = () => pictureDir() + "/" + CULTIVAR_SUB;
const receiptDir = () => pictureDir() + "/" + RECEIPT_SUB;
/* The farm's keys are the bare names; anything else is prefixed. */
const bookKey   = base => BOOK === "farm" ? base : base + ":" + BOOK;
const PHOTO_MIME = "image/jpeg";   /* "image/webp" here is ~30% smaller at the same quality */
const PHOTO_EXT = ".jpg";
/* A receipt does not always arrive as a photograph. One a vendor emailed is a PDF, and
   there is nothing here to re-draw a PDF with — no library, and none worth carrying for
   this — so it is kept exactly as it came. It is already small: a page of text weighs
   less as a PDF than a photograph of the same page does.

   The file is named for what it actually is, so it opens by its own name out of the
   repository, and so a receipt replaced by one of the other kind can be told from the
   one it replaced. */
const PDF_MIME = "application/pdf";
const PDF_EXT = ".pdf";
const extOf = blob => (blob && blob.type === PDF_MIME) ? PDF_EXT : PHOTO_EXT;
const isPdfRef = p => typeof p === "string" &&
  (p.toLowerCase().endsWith(PDF_EXT) || p.startsWith("data:" + PDF_MIME));

/* Named for the record it belongs to, in the directory its kind belongs in. Both are
   the shelves' own idea of where a picture goes, so there is one place to change it. */
const photoFile  = (o, ext = PHOTO_EXT) => o.id + ext;
const photoRef   = v => photoDir() + "/" + photoFile(v);
const receiptRef = (t, ext = PHOTO_EXT) => receiptDir() + "/" + photoFile(t, ext);
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

/* ---------- the pictures ---------- */
/* Two kinds of picture are kept in the repository and neither knows anything about the
   other: the photograph of a cultivar, and the receipt for a transaction. What it takes
   to hold one — the shelf of live URLs, this device's own copy so the app opens with no
   signal, writing it, taking it away — is the same for both, so it is written once here
   and made twice below. What differs is named in the spec each one is made with: which
   name its file goes under, which field on the record points at it, which records can
   carry one at all, and what to call it in a commit message.

   A shelf is keyed by the record's own id, and the two shelves are separate maps, so a
   cultivar called 3 and transaction 3 can never be handed each other's picture. */
function shelf(spec){
  const S = {
    ref: spec.ref,                 /* (o, ext) => where this record's picture belongs */
    field: spec.field,             /* what the record carries the path in */
    records: spec.records,         /* (db) => the records that can carry one */
    noun: spec.noun,               /* "Photograph" | "Receipt", for the commit message */
    key: spec.key,                 /* this kind's name on the device's shelf */
    forget: spec.forget || (() => {}),   /* anything else cleared when the picture goes */

    base:null, git:false, urls:new Map(), missing:new Set(), shas:new Map(),

    /* One name per picture across both shelves, for the queue of what is owed. */
    owedKey: o => S.key + ":" + o.id,
    said: o => S.noun + " " + (spec.of ? spec.of(o) : S.ref(o)),

    /* Served mode: the directory is just a path next to the page. Read only. */
    mountWeb(){ S.git = false; S.base = new URL("./", location.href).href; },
    /* Repository mode: a directory of files reached over the wire, and kept on this
       device afterwards so the app opens instantly and works out of range. */
    mountGit(){ S.base = null; S.git = true; },
    /* Picked mode: nowhere to put a file — the picture rides inside the records
       themselves until there is somewhere to file it. */
    mountNone(){ S.base = null; S.git = false; },

    /* What to show, or nothing. A record pointing at a file that is not there falls
       back to nothing rather than to a broken picture. */
    url(o){
      const held = S.urls.get(o.id);
      if(held) return held;
      /* A picture taken with no signal rides inside the record until it can be
         lifted out into a file of its own. */
      if(isInline(o[S.field])) return o[S.field];
      return null;
    },

    /* One-time lift out of the old shape: an inline picture becomes a file of its own
       and the record keeps only the path to it. Read-through modes cannot write, so
       they leave the records exactly as they are. */
    async adopt(db){
      if(!S.git) return 0;
      let n = 0;
      for(const o of S.records(db)){
        if(!isInline(o[S.field])) continue;
        try{ await S.write(o, dataUrlToBlob(o[S.field])); n++; }
        catch(e){ if(e.kind !== "offline") throw e; }   /* out of range: it waits in the record */
      }
      return n;
    },

    /* Opened together rather than one after another — forty reads in a row is forty
       rounds of waiting before the app appears. */
    async loadAll(db){
      S.clear();
      const want = S.records(db).filter(o => hasPhotoRef(o[S.field]) && !isInline(o[S.field]));
      if(S.git){
        await Promise.all(want.map(o => S.fromGit(o)));
      }else if(S.base){
        /* Served: the picture is at a plain URL, so it is loaded once to find out
           whether it is really there. Only the ones that answer are kept. */
        await Promise.all(want.map(o => new Promise(res => {
          const src = new URL(o[S.field], S.base).href;
          const im = new Image();
          im.onload  = () => { S.urls.set(o.id, src); res(); };
          im.onerror = () => { S.missing.add(o.id); res(); };
          im.src = src;
        })));
      }else{
        for(const o of want) S.missing.add(o.id);
      }
      return S.urls.size;
    },

    /* This device's own copy of a picture, so that the second opening of the app costs
       nothing and the hundredth works with no signal at all. */
    cacheKey: o => bookKey(S.key) + ":" + o.id,
    async cached(o){ return IDB.get(S.cacheKey(o)); },
    async keep(o, blob, sha){ await IDB.set(S.cacheKey(o), { blob, sha, path: o[S.field], at: Date.now() }); },
    async drop(o){ await IDB.del(S.cacheKey(o)); },

    async fromGit(o){
      const c = await S.cached(o).catch(() => null);
      if(c && c.blob && c.path === o[S.field]){
        S.hold(o, URL.createObjectURL(c.blob));
        if(c.sha) S.shas.set(o.id, c.sha);
        return true;
      }
      try{
        const got = await Git.getBlob(o[S.field]);
        if(!got){ S.missing.add(o.id); return false; }
        S.hold(o, URL.createObjectURL(got.blob));
        await S.keep(o, got.blob, null);
        return true;
      }catch(e){
        S.missing.add(o.id);
        return false;
      }
    },

    /* Writes the picture, then points the record at it — as a file wherever there is
       somewhere to put one, and inside the record itself where there is not. */
    async write(o, blob){
      if(S.git){
        /* The name follows what is actually being written, so a photograph replaced by
           a PDF lands as .pdf — and the old .jpg is taken away below rather than left
           behind under a name nothing points at any more. */
        const path = S.ref(o, extOf(blob));
        const was = o[S.field];
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const b64 = bytesToB64(bytes);
        /* Held on this device first. If the wire is down the picture is still safe and
           still shows, and the sending of it joins the queue. */
        o[S.field] = path;
        S.hold(o, URL.createObjectURL(blob));
        await S.keep(o, blob, S.shas.get(o.id) || null);
        try{
          /* Writing over a picture needs the sha of the one already there. A sha handed
             back by an earlier write is trustworthy; otherwise it is asked for, and a
             404 simply means this is the first picture of this record. */
          let sha = S.shas.get(o.id);
          if(sha === undefined) sha = await Git.shaOf(path);
          const put = await Git.put(path, b64, sha || null, S.said(o));
          if(put){ S.shas.set(o.id, put); await S.keep(o, blob, put); }
        }catch(e){
          if(e.kind === "conflict"){
            /* Someone replaced this picture elsewhere; take their sha and put ours over
               it, since a picture has no merge and the old one is still in history. */
            const sha = await Git.shaOf(path).catch(() => null);
            const put = await Git.put(path, b64, sha, S.said(o));
            if(put) S.shas.set(o.id, put);
          }else if(e.kind === "offline"){
            await Outbox.queuePhoto(S.owedKey(o), path, b64, S.noun);
          }else throw e;
        }
        /* A picture that used to live somewhere else — an older edition of the app filed
           these in the root of photos/ — leaves nothing behind at the old name. */
        if(hasPhotoRef(was) && !isInline(was) && was !== path)
          await Git.del(was, null, "Remove " + was).catch(() => {});
      }else{
        S.hold(o, null);
        o[S.field] = await blobToDataUrl(blob);
      }
      S.missing.delete(o.id);
      return o[S.field];
    },

    async remove(o){
      const at = o[S.field];
      const path = hasPhotoRef(at) && !isInline(at) ? at : S.ref(o);
      if(S.git){
        await S.drop(o).catch(() => {});
        try{ await Git.del(path, S.shas.get(o.id) || null, "Remove " + S.noun.toLowerCase() + " " + path); }
        catch(e){ if(e.kind === "offline") await Outbox.queuePhoto(S.owedKey(o), path, null, S.noun); }
        S.shas.delete(o.id);
      }
      S.hold(o, null);
      o[S.field] = null;
      S.forget(o);
    },

    /* One live blob URL per record; the one it replaces is handed back to the browser.
       A plain http URL passed to revokeObjectURL is simply ignored, so served mode can
       share the same shelf without a second code path. */
    hold(o, url){
      const old = S.urls.get(o.id);
      if(old) URL.revokeObjectURL(old);
      if(url) S.urls.set(o.id, url); else S.urls.delete(o.id);
    },
    clear(){
      for(const u of S.urls.values()) URL.revokeObjectURL(u);
      S.urls.clear(); S.missing.clear();
    }
  };
  return S;
}

/* The photograph of a cultivar: one per cultivar, named for it, and the crop that says
   which part of it the circle shows goes when the photograph does. */
const Photos = shelf({
  ref: photoRef, field: "photo", key: "photo", noun: "Photograph",
  records: db => db.cultivars || [],
  of: v => "of " + (v.name || v.id),
  forget: v => { v.photoCrop = null; },
});

/* The receipt for a transaction: one per transaction, named for its number. There is
   no crop — a receipt is shown whole, because the part you want is never the middle. */
const Receipts = shelf({
  ref: receiptRef, field: "receipt", key: "receipt", noun: "Receipt",
  records: db => db.transactions || [],
  of: t => "for transaction " + t.id,
});

/* Both shelves at once, which is what everything outside this file actually wants:
   mounting, emptying and loading are never about one kind of picture alone. */
const Pictures = {
  all: [Photos, Receipts],
  mountWeb(){ for(const S of Pictures.all) S.mountWeb(); },
  mountGit(){ for(const S of Pictures.all) S.mountGit(); },
  mountNone(){ for(const S of Pictures.all) S.mountNone(); },
  clear(){ for(const S of Pictures.all) S.clear(); },
  /* Both books can name a record the same thing, so changing books empties these
     rather than reaching into them. */
  forgetShas(){ for(const S of Pictures.all) S.shas.clear(); },
  async loadAll(db){ let n = 0; for(const S of Pictures.all) n += await S.loadAll(db); return n; },
  async adopt(db){ let n = 0; for(const S of Pictures.all) n += await S.adopt(db); return n; },
};

/* ---------- what is owed ---------- */
/* Everything that was done out of range and has not been sent yet. The records are
   one entry because only the latest matters; pictures are one entry each because they
   are separate files and each stands alone. The key is the shelf's name and the
   record's id together, so a cultivar's photograph and a transaction's receipt can
   never queue over one another. */
const Outbox = {
  async read(){ return (await IDB.get(bookKey("outbox"))) || { data:null, photos:{} }; },
  async write(o){ await IDB.set(bookKey("outbox"), o); },

  async queueData(text){
    const o = await Outbox.read();
    o.data = { text, at: Date.now() };
    await Outbox.write(o);
  },
  async queuePhoto(id, path, b64, noun){
    const o = await Outbox.read();
    o.photos = o.photos || {};
    o.photos[id] = { path, b64, noun, at: Date.now() };   /* b64 null means: delete it */
    await Outbox.write(o);
  },
  /* How much is still owed: the records count as one, and each picture as itself. */
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
    if(Store.mode === "github"){ Store.label = Git.label; Pictures.mountGit(); }
    /* Both of these are keyed by the record's id alone, and the two books can name a
       record the same thing — so they are emptied rather than reached into. */
    Pictures.clear();
    Pictures.forgetShas();
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
    Pictures.mountGit();
    Store._first = got.text;
    return true;
  },
  async restoreRepo(){
    const cfg = await Git.loadConfig();
    if(!cfg) return false;
    Store.mode = "github";
    Store.label = Git.label;
    Pictures.mountGit();
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
    Pictures.mountWeb();
    return db;
  },

  /* ---- picked: you handed it the file yourself ---- */
  async openPicked(file){
    const db = JSON.parse(await file.text());
    Store.mode = "picked";
    Store.label = file.name || dataFile();
    Store.unsent = false;
    Pictures.mountNone();
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
    if(Store.mode === "github"){ await Git.loadConfig(); Pictures.mountGit(); }
    else if(Store.mode === "served" && Store.servedCapable) Pictures.mountWeb();
    else Pictures.mountNone();
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
        await Pictures.loadAll(db);
        return db;
      }
    }
    /* An edit made out of range outranks the copy on the wire — it is newer, and it
       is the only copy of that afternoon. */
    const owed = await Outbox.read();
    if(owed.data && owed.data.text){ text = owed.data.text; Store.unsent = true; }
    Store.sha = sha;
    const db = JSON.parse(text);
    const moved = await Pictures.adopt(db);
    await Pictures.loadAll(db);
    await Store.keepLocal(text);
    if(moved){
      await Store.save(db);
      Store.say(moved + " picture" + (moved === 1 ? "" : "s") + " lifted into " + pictureDir() + "/");
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
    await Pictures.loadAll(db);
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
      /* Queued before this edition knew there was more than one kind of picture. */
      const noun = p.noun || "Photograph";
      const gone = "Remove " + noun.toLowerCase() + " " + p.path;
      try{
        if(p.b64 === null || p.b64 === undefined) await Git.del(p.path, null, gone);
        else await Git.put(p.path, p.b64, await Git.shaOf(p.path), noun + " " + p.path);
        delete o.photos[id];
        sent++;
      }catch(e){
        if(e.kind === "offline"){ await Outbox.write(o); return sent; }
        if(e.kind === "conflict"){
          try{
            const sha = await Git.shaOf(p.path);
            if(p.b64) await Git.put(p.path, p.b64, sha, noun + " " + p.path);
            else if(sha) await Git.del(p.path, sha, gone);
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
  window.IDB = IDB; window.Git = Git; window.Store = Store; window.Outbox = Outbox;
  window.Photos = Photos; window.Receipts = Receipts; window.Pictures = Pictures;
  window.GitError = GitError; window.BUILD = BUILD;
  /* DATA_FILE and PHOTO_DIR stay the farm's own names, which is what everything
     outside this file has always meant by them; dataFile(), pictureDir(), photoDir()
     and receiptDir() are the open book's. */
  window.DATA_FILE = DATA_FILE; window.PHOTO_DIR = PHOTO_DIR; window.PHOTO_MIME = PHOTO_MIME; window.PHOTO_EXT = PHOTO_EXT;
  window.BOOKS = BOOKS; window.dataFile = dataFile;
  window.PDF_MIME = PDF_MIME; window.PDF_EXT = PDF_EXT; window.isPdfRef = isPdfRef;
  window.pictureDir = pictureDir; window.photoDir = photoDir; window.receiptDir = receiptDir;
}
if(typeof module !== "undefined" && module.exports){
  module.exports = { IDB, Git, Photos, Receipts, Pictures, Store, Outbox, GitError,
    DATA_FILE, PHOTO_DIR, PHOTO_EXT, PHOTO_MIME, PDF_MIME, PDF_EXT, isPdfRef, extOf,
    CULTIVAR_SUB, RECEIPT_SUB,
    BOOKS, dataFile, pictureDir, photoDir, receiptDir,
    photoFile, photoRef, receiptRef, isInline, hasPhotoRef, dataUrlToBlob, blobToDataUrl, b64ToBytes, bytesToB64, textToB64, b64ToText };
}
