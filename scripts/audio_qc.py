"""讲解配音质检：响度一致性、异常长停顿、首尾截断、削波、清单时长，以及 faster-whisper 回听（按拼音比对稿子）。
用 F5 环境的 Python 运行（含 faster-whisper / pypinyin）：
  "F:\\我的编程项目\\123_AI视频自动化\\tools\\f5-tts-env\\python.exe" scripts/audio_qc.py              # 检查全部
  "...\\python.exe" scripts/audio_qc.py --since 2026-10-29T09:00                                     # 只检查此时间之后生成的文件
  "...\\python.exe" scripts/audio_qc.py 太和殿 乾清宫                                                # 只检查这几条
结果写入 docs/audio-qc.json，并打印需要留意的条目。
"""
import json, os, shutil, subprocess, sys, datetime
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
sys.argv, _argv = [sys.argv[0]], sys.argv  # guide_tts 在导入时不解析参数，这里保险起见
import guide_tts as g
sys.argv = _argv

FF = shutil.which("ffmpeg") or "ffmpeg"
SR = 16000


def acoustic(path):
    raw = subprocess.run([FF, "-loglevel", "error", "-i", path, "-f", "s16le", "-ac", "1", "-ar", str(SR), "-"], capture_output=True).stdout
    x = np.frombuffer(raw, "<i2").astype(np.float32) / 32768
    hop = SR // 50
    fr = x[: len(x) // hop * hop].reshape(-1, hop)
    e = np.sqrt(np.mean(fr ** 2, 1))
    act = e > 0.01
    if not act.any():
        return {"silent": True}
    a, b = int(np.argmax(act)), len(act) - int(np.argmax(act[::-1]))
    longest = run = 0
    for s in ~act[a:b]:
        run = run + 1 if s else 0
        longest = max(longest, run)
    return {
        "dur": round(len(x) / SR, 2),
        "rms": round(float(20 * np.log10(np.sqrt(np.mean(fr[act] ** 2)) + 1e-9)), 1),
        "gap": round(longest * hop / SR, 2),
        "lead": round(a * hop / SR, 2),
        "tail": round((len(act) - b) * hop / SR, 2),
        "endCut": bool(act[-10:].mean() > 0.5),
        "clip": round(float(np.mean(np.abs(x) > 0.985)), 5),
    }


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    since = None
    if "--since" in sys.argv:
        since = datetime.datetime.fromisoformat(sys.argv[sys.argv.index("--since") + 1]).timestamp()
        args = [a for a in args if a != sys.argv[sys.argv.index("--since") + 1]]
    man = json.load(open(g.MANIFEST, encoding="utf-8"))
    entries = {e["name"]: e for e in g.load_entries()}
    names = [n for n in (args or man.keys()) if n in man and n in entries]
    if since:
        names = [n for n in names if os.path.getmtime(os.path.join(g.OUT_DIR, man[n]["file"])) >= since]
    rows = []
    for i, n in enumerate(names, 1):
        p = os.path.join(g.OUT_DIR, man[n]["file"])
        r = acoustic(p)
        ratio, heard = g.asr_check(p, g.speech_text(entries[n]))
        r.update({"name": n, "asr": round(ratio, 4), "heard": heard, "manifestDur": man[n]["dur"],
                  "rate": round(len(g.speech_text(entries[n])) / max(0.1, man[n]["dur"]), 2)})
        rows.append(r)
        print(f"  [{i}/{len(names)}] {n}  asr {ratio:.2f}  rms {r.get('rms')}  gap {r.get('gap')}", flush=True)
    if not rows:
        print("没有需要检查的条目")
        return
    med = float(np.median([r["rms"] for r in rows if "rms" in r]))
    flags = []
    for r in rows:
        why = []
        if r.get("silent"): why.append("静音")
        else:
            if r["asr"] < 0.93: why.append(f"回听吻合度 {r['asr']:.2f}")
            if abs(r["rms"] - med) > 2.5: why.append(f"响度偏差 {r['rms'] - med:+.1f}dB")
            if r["gap"] > 1.2: why.append(f"内部停顿 {r['gap']}s")
            if r["lead"] > 0.8 or r["tail"] > 1.2: why.append("首尾静音过长")
            if r["endCut"]: why.append("结尾疑似截断")
            if r["clip"] > 0.0005: why.append("削波")
            if abs(r["dur"] - r["manifestDur"]) > 0.5: why.append("时长与清单不符")
            if not 4.3 <= r["rate"] <= 6.0: why.append(f"语速异常 {r['rate']} 字/秒")
        if why: flags.append((r["name"], why, r.get("heard", "")[:60]))
    with open(os.path.join(ROOT, "docs", "audio-qc.json"), "w", encoding="utf-8") as f:
        json.dump({"checked": len(rows), "flagged": len(flags), "rmsMedian": med, "results": rows}, f, ensure_ascii=False, indent=2)
    asr = [r["asr"] for r in rows if "asr" in r]
    print(f"检查 {len(rows)} 条：回听吻合度 最低 {min(asr):.2f} 中位 {np.median(asr):.2f}；响度中位 {med:.1f} dBFS")
    print(f"需要留意 {len(flags)} 条：")
    for n, why, heard in flags:
        print(f"  {n}：{'；'.join(why)}  听到：{heard}")


if __name__ == "__main__":
    main()
