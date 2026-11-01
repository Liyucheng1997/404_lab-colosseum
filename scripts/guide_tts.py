"""罗马斗兽场讲解词配音：F5-TTS（音色“人工老龙凤”，沿用故宫项目），调用 123_AI视频自动化 项目的 src/tts_f5.py，做法与 hand-drawn-story-video 一致：
逐句合成、同一段参考音频克隆音色、并发 4、去首尾静音，句间留气口，最后用 ffmpeg 压成 mp3。

必须用那个项目自带的 Python 运行（含 CUDA torch / F5-TTS / pypinyin）：
  "F:\\我的编程项目\\123_AI视频自动化\\tools\\f5-tts-env\\python.exe" scripts/guide_tts.py            # 合成所有没录好或稿子改过的条目
  "...\\python.exe" scripts/guide_tts.py 太和殿 乾清宫                                            # 只重录这几条
  "...\\python.exe" scripts/guide_tts.py --check                                                  # 额外用 faster-whisper 核对读音，列出可疑条目
输入：src/data/guide/*.json（[{name, text, speech?}]）
输出：public/audio/guide/<id>.mp3 + src/data/guide/audio.json（name -> {file, dur, key}）
"""
import hashlib, json, os, re, subprocess, sys, time, glob, shutil, tempfile, difflib
from concurrent.futures import ThreadPoolExecutor, as_completed

AUTO_PROJECT = os.environ.get("AUTO_PROJECT", r"F:\我的编程项目\123_AI视频自动化")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GUIDE_DIR = os.path.join(ROOT, "src", "data", "guide")
OUT_DIR = os.path.join(ROOT, "public", "audio", "guide")
MANIFEST = os.path.join(GUIDE_DIR, "audio.json")
SR = 44100

sys.path.insert(0, AUTO_PROJECT)
from src import config  # 导入时把 HF 缓存指向项目内 models/，并把 CUDA dll 加进 PATH
config.TTS_VOICE = os.environ.get("TTS_VOICE", "人工老龙凤")
from src import tts_f5

import numpy as np
from scipy.signal import resample_poly

VOICE = config.TTS_VOICE
PARALLEL = max(1, min(4, int(os.environ.get("F5_TTS_PARALLEL", "4"))))
FFMPEG = shutil.which("ffmpeg") or "ffmpeg"

# 多音字/古建术语读音纠正：只改朗读稿，不改界面文字（F5 前端读成了错误声调或错误读音的词）
SPEECH_FIX = [
    ("角斗", "决斗"), ("重装", "众装"), ("长直号", "常直浩"), ("弯号", "弯浩"), ("号角", "浩角"),
    ("长轴", "常轴"), ("长矛", "常矛"), ("长袍", "常袍"), ("长方", "常方"), ("长木杖", "常木杖"),
    ("长约", "常约"), ("长短", "常短"), ("一长一短", "一常一短"), ("一枝", "一支"), ("盔", "亏"),
    ("朝下", "潮下"), ("也差", "也岔"), ("调配", "条配"), ("乐队", "越队"), ("乐手", "越手"),
    ("露着", "漏着"), ("藏红花", "葬红花"), ("当作", "荡作"), ("一长就", "一常就"), ("擅长", "擅常"),
]


def speech_text(e):
    t = e.get("speech") or e["text"]
    for a, b in SPEECH_FIX:
        t = t.replace(a, b)
    t = re.sub(r"[「」『』（）()\[\]【】]", "", t)
    t = t.replace("——", "，").replace("…", "。").replace("·", "")
    return t.strip()


def sentences(t):
    """按句号等切句；过长的句子再按逗号切开（F5 单次合成太长容易吞字）。返回 [(句子, 句后停顿秒)]"""
    out = []
    for s in re.findall(r"[^。！？；!?;]+[。！？；!?;]?", t):
        s = s.strip()
        if not s:
            continue
        if len(s) <= 48:
            out.append((s, 0.42))
            continue
        parts = re.findall(r"[^，,、：:]+[，,、：:]?", s)
        buf = ""
        for p in parts:
            if len(buf) + len(p) > 40 and buf:
                out.append((buf, 0.2))
                buf = p
            else:
                buf += p
        if buf:
            out.append((buf, 0.42))
    return out


def key_of(t):
    return hashlib.md5(("f5g1" + VOICE + t).encode("utf-8")).hexdigest()[:12]


def file_id(name):
    return hashlib.md5(name.encode("utf-8")).hexdigest()[:10]


def trim(x, sr):
    hop = sr // 100
    if len(x) < hop * 4:
        return x
    e = np.sqrt(np.mean(x[: len(x) // hop * hop].reshape(-1, hop) ** 2, 1))
    on = np.where(e > max(0.004, e.max() * 0.03))[0]
    if not len(on):
        return x
    a = max(0, (on[0] - 4) * hop)
    b = min(len(x), (on[-1] + 10) * hop)
    return x[a:b]


def synth_sentence(idx, text, ref_audio, ref_text):
    wav, sr = tts_f5._synth_one(text, ref_audio, ref_text)
    x = trim(np.asarray(wav, np.float32), sr)
    x = resample_poly(x, SR, sr).astype(np.float32)
    f = int(0.01 * SR)
    x[:f] *= np.linspace(0, 1, f)
    x[-f * 3:] *= np.linspace(1, 0, f * 3)
    return idx, x


def encode_mp3(x, path):
    if not len(x) or not np.isfinite(x).all() or float(np.max(np.abs(x))) < 0.001:
        raise ValueError(f"合成结果为空、静音或无效：{path}")
    peak = float(np.max(np.abs(x))) or 1.0
    x = x / peak * 0.89  # 峰值归一化约 -1 dBFS
    pcm = (np.clip(x, -1, 1) * 32767).astype("<i2").tobytes()
    temp_path = path + ".tmp.mp3"
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-f", "s16le", "-ar", str(SR), "-ac", "1", "-i", "pipe:0",
                    "-codec:a", "libmp3lame", "-b:a", "80k", temp_path], input=pcm, check=True)
    os.replace(temp_path, path)


def save_manifest(manifest):
    temp = MANIFEST + ".tmp"
    with open(temp, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    os.replace(temp, MANIFEST)


def load_entries():
    entries = []
    for f in sorted(glob.glob(os.path.join(GUIDE_DIR, "*.json"))):
        if os.path.basename(f) == "audio.json":
            continue
        data = json.load(open(f, encoding="utf-8"))
        for e in data:
            if e.get("name") and e.get("text"):
                entries.append(e)
    return entries


_ASR = None


def asr_check(path, text):
    global _ASR
    from faster_whisper import WhisperModel
    from pypinyin import lazy_pinyin
    if _ASR is None:
        if os.environ.get("GUIDE_ASR_DEVICE") == "cpu":
            _ASR = WhisperModel("small", device="cpu", compute_type="int8", cpu_threads=4)
        else:
            try:
                _ASR = WhisperModel("small", device="cuda", compute_type="float16")
            except Exception:
                _ASR = WhisperModel("small", device="cpu", compute_type="int8")
    segs, _ = _ASR.transcribe(path, language="zh", vad_filter=False, initial_prompt="以下是普通话讲解。")
    heard = "".join(s.text for s in segs)
    norm = lambda s: [lazy_pinyin(c)[0] for c in re.findall(r"[一-鿿]", s)]
    sm = difflib.SequenceMatcher(None, norm(text), norm(heard), autojunk=False)
    return sm.ratio(), heard


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    check = "--check" in sys.argv
    os.makedirs(OUT_DIR, exist_ok=True)
    manifest = json.load(open(MANIFEST, encoding="utf-8")) if os.path.exists(MANIFEST) else {}
    entries = load_entries()
    if len({e["name"] for e in entries}) != len(entries):
        raise ValueError("讲解名称重复，请先区分同名建筑，避免音频覆盖")
    todo = []
    for e in entries:
        t = speech_text(e)
        k = key_of(t)
        m = manifest.get(e["name"])
        fresh = m and m.get("key") == k and os.path.exists(os.path.join(OUT_DIR, m["file"]))
        if (args and e["name"] in args) or (not args and not fresh):
            todo.append((e, t, k))
    print(f"engine=f5 voice={VOICE} 并发 {PARALLEL}  条目 {len(entries)}，需要合成 {len(todo)} 条", flush=True)
    if todo and "--check-only" not in sys.argv:
        ref_audio, ref_text = tts_f5._resolve_voice()
        if VOICE == "人工老龙凤" and os.path.basename(ref_audio) != "人工老龙凤.wav":
            raise RuntimeError("缺少人工老龙凤参考音频，停止合成，避免自动更换音色")
        tts_f5._get_model()
        t_all = time.time()
        jobs = []  # (条目序号, 句序号)
        plan = []
        for n, (e, t, k) in enumerate(todo):
            sents = sentences(t)
            plan.append({"e": e, "k": k, "sents": sents, "parts": [None] * len(sents), "left": len(sents), "t0": None})
            jobs += [(n, i) for i in range(len(sents))]
        done_n = 0
        with ThreadPoolExecutor(max_workers=PARALLEL) as pool:
            futs = {pool.submit(synth_sentence, (n, i), plan[n]["sents"][i][0], ref_audio, ref_text): (n, i) for n, i in jobs}
            for fu in as_completed(futs):
                (n, i), x = fu.result()
                p = plan[n]
                p["parts"][i] = x
                p["left"] -= 1
                if p["left"]:
                    continue
                pieces = []
                for (s_, gap), xx in zip(p["sents"], p["parts"]):
                    pieces.append(xx)
                    pieces.append(np.zeros(int(gap * SR), np.float32))
                audio = np.concatenate([np.zeros(int(0.15 * SR), np.float32)] + pieces)
                e = p["e"]
                fid = file_id(e["name"])
                encode_mp3(audio, os.path.join(OUT_DIR, fid + ".mp3"))
                manifest[e["name"]] = {"file": fid + ".mp3", "dur": round(len(audio) / SR, 2), "key": p["k"]}
                save_manifest(manifest)
                p["parts"] = None
                done_n += 1
                print(f"  [{done_n}/{len(todo)}] {e['name']}  {len(audio) / SR:5.1f}s  {len(p['sents'])} 句  已用 {time.time() - t_all:.0f}s", flush=True)
        print(f"合成完成，用时 {time.time() - t_all:.0f}s", flush=True)
    # 清理已不存在条目的清单项
    names = {e["name"] for e in entries}
    for k in list(manifest):
        if k not in names:
            manifest.pop(k)
    save_manifest(manifest)
    if check:
        bad = []
        results = []
        for e in entries:
            m = manifest.get(e["name"])
            if not m:
                continue
            r, heard = asr_check(os.path.join(OUT_DIR, m["file"]), speech_text(e))
            results.append({"name": e["name"], "ratio": round(r, 4), "heard": heard})
            print(f"  核对 [{len(results)}/{len(entries)}] {e['name']} {r:.2f}", flush=True)
            if r < 0.93:
                bad.append((r, e["name"], heard[:60]))
        bad.sort()
        print("需要留意（识别与稿子拼音吻合度 < 93%）：")
        for r, n, h in bad:
            print(f"  {r:.2f}  {n}  听到：{h}")
        report = {"engine": "f5", "voice": VOICE, "checked": len(results), "flagged": len(bad), "results": results}
        with open(os.path.join(ROOT, "docs", "audio-asr-check.json"), "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
