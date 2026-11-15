/**
 * A bookmarklet the manager runs on instagram.com on a computer: on a post it collects the
 * comments; with a followers (or likes) list open it collects the accounts in it.
 * Instagram stops usernames from being selected, so copying by hand loses who wrote what.
 * This keeps loading until nothing new appears (or the manager presses stop) and hands back
 * "username<TAB>comment" lines for parseComments, or one username per line for parseList.
 * It runs in the manager's own browser and sends nothing anywhere.
 *
 * It depends on Instagram's page layout (each comment has its author in an <h3>), so if
 * Instagram changes that, the copy-and-paste route still works for the comment text.
 */
export function collectInstagramComments() {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const root: ParentNode = document.querySelector("[role=dialog] article") ?? document.querySelector("article") ?? document;
  document.getElementById("lahab-collector")?.remove();

  const panel = document.createElement("div");
  panel.id = "lahab-collector";
  panel.setAttribute("dir", "rtl");
  panel.style.cssText =
    "position:fixed;z-index:2147483647;inset:auto 16px 16px auto;width:min(420px,calc(100vw - 32px));background:#1c1310;color:#fdf6ec;border:1px solid #e0401f;border-radius:16px;padding:16px;font:14px system-ui,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.5)";
  const status = document.createElement("p");
  status.style.margin = "0 0 8px";
  panel.append(status);
  document.body.append(panel);
  const say = (t: string) => (status.textContent = t);

  const count = () => root.querySelectorAll("h3 a[href]").length;
  const loadMore = () => {
    const icon = [...root.querySelectorAll("svg[aria-label]")].find((s) =>
      /load more comments|تحميل (المزيد من )?التعليقات/i.test(s.getAttribute("aria-label") ?? ""),
    );
    const button = icon?.closest("button,[role=button]") as HTMLElement | null;
    if (button) button.click();
    const list = root.querySelector("ul");
    // Scroll whichever ancestor of the comments list actually scrolls.
    for (let el: HTMLElement | null = list?.parentElement ?? null; el; el = el.parentElement) {
      if (el.scrollHeight > el.clientHeight + 10 && /auto|scroll/.test(getComputedStyle(el).overflowY)) {
        el.scrollTop = el.scrollHeight;
        break;
      }
    }
    return !!button;
  };

  // A followers / following / likes list opens as a dialog of profile links with no post in it.
  const list = [...document.querySelectorAll("[role=dialog]")].reverse().find((d) => !d.querySelector("article") && d.querySelector("a[href]"));
  let stopped = false;
  const stop = document.createElement("button");
  stop.textContent = "إيقاف وأخذ اللي تجمّع";
  stop.style.cssText = "padding:8px 14px;border-radius:999px;border:0;font-weight:700;cursor:pointer";
  stop.onclick = () => (stopped = true);
  panel.append(stop);

  const show = (lines: string[], what: string) => {
    stop.remove();
    const out = lines.join("\n");
    const people = new Set(lines.map((l) => l.split("\t")[0])).size;
    const box = document.createElement("textarea");
    box.value = out;
    box.readOnly = true;
    box.style.cssText = "width:100%;height:140px;background:#000;color:#fdf6ec;border-radius:8px;border:0;padding:8px;font:12px monospace;direction:ltr";
    const copy = document.createElement("button");
    const close = document.createElement("button");
    for (const b of [copy, close])
      b.style.cssText = "margin-top:8px;margin-inline-end:8px;padding:8px 14px;border-radius:999px;border:0;font-weight:700;cursor:pointer";
    copy.style.background = "#e0401f";
    copy.style.color = "#fff";
    copy.textContent = "نسخ";
    close.textContent = "إغلاق";
    close.onclick = () => panel.remove();
    copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(out);
      } catch {
        box.select();
        document.execCommand("copy");
      }
      copy.textContent = "تم النسخ ✓";
    };
    panel.append(box, copy, close);
    say(`${what} ${people} حساب. انسخها والصقها في صفحة السحوبات.`);
  };

  const runList = async (dialog: Element) => {
    // The list may drop rows it has scrolled past, so names are kept as they appear.
    const names = new Set<string>();
    const grab = () => {
      for (const a of dialog.querySelectorAll("a[href]")) {
        const m = /^\/([A-Za-z0-9._]{1,30})\/$/.exec(a.getAttribute("href") ?? "");
        if (m && a.textContent?.trim()) names.add(m[1]!.toLowerCase());
      }
    };
    const scroller = [...dialog.querySelectorAll<HTMLElement>("*")].find(
      (el) => el.scrollHeight > el.clientHeight + 10 && /auto|scroll/.test(getComputedStyle(el).overflowY),
    );
    let still = 0;
    while (!stopped && still < 6) {
      const before = names.size;
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
      // A steady, human pace: Instagram slows down or blocks accounts that scroll too fast.
      await sleep(1500);
      grab();
      still = names.size === before ? still + 1 : 0;
      say(`جاري التجميع… ${names.size} حساب. (القوائم الكبيرة تاخذ وقت، تقدر توقف متى ما تبي)`);
    }
    show([...names], "تجمّع");
  };

  const runComments = async () => {
    let last = -1;
    let still = 0;
    while (!stopped && still < 4) {
      say(`جاري تحميل التعليقات… ${count()}`);
      loadMore();
      await sleep(1200);
      const n = count();
      still = n === last ? still + 1 : 0;
      last = n;
    }
    const lines: string[] = [];
    for (const h of root.querySelectorAll("h3")) {
      const name = h.querySelector("a[href]")?.textContent?.trim();
      if (!name) continue;
      const text = ((h.nextElementSibling as HTMLElement | null)?.innerText ?? "").replace(/\s+/g, " ").trim();
      lines.push(`${name}\t${text}`);
    }
    show(lines, `${lines.length} تعليق من`);
  };

  const run = () => {
    if (list) return runList(list);
    if (root.querySelector("h3 a[href]")) return runComments();
    stop.remove();
    say("افتح منشور (للتعليقات) أو افتح قائمة المتابعين من صفحة الحساب، وبعدها اضغط الزر.");
    const close = document.createElement("button");
    close.textContent = "إغلاق";
    close.style.cssText = "padding:8px 14px;border-radius:999px;border:0;font-weight:700;cursor:pointer";
    close.onclick = () => panel.remove();
    panel.append(close);
  };
  void run();
}

/** The bookmarklet URL; set on the link after render because React refuses javascript: hrefs. */
export const collectorBookmarklet = () => `javascript:${encodeURIComponent(`(${collectInstagramComments.toString()})()`)}`;
