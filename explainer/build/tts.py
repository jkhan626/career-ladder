import asyncio, json, subprocess, os, sys
import edge_tts
VOICE = sys.argv[1] if len(sys.argv) > 1 else "en-US-AvaMultilingualNeural"
RATE = "+8%"
# (id, spoken text, caption text, pause after in seconds)
LINES = [
 ("hook",   "Ever dreamed of becoming a registered nurse?", "Ever dreamed of becoming a registered nurse?", 0.4),
 ("what",   "With the Nursing Career Ladder, NYC Health and Hospitals pays your CUNY tuition, so you can become an R.N. while you keep working.",
            "With the Nursing Career Ladder, NYC Health + Hospitals pays your CUNY tuition, so you can become an RN while you keep working.", 0.45),
 ("tracks", "Pick your track: Behavioral Health, or Med-Surge.", "Pick your track: Behavioral Health or Med-Surg.", 0.35),
 ("titles", "It's for full-time P C A's, P C T's, P S H T's, or B H A's,",
            "It's for full-time PCAs, PCTs, PSHTs, or BHAs,", 0.15),
 ("tenure", "with one year of service by December thirty-first, who have never been in a nursing program.",
            "with one year of service by December 31, who have never been in a nursing program.", 0.45),
 ("prereq", "You'll need at least five prerequisites, with mostly A's and B's. Then the program pays for the rest.",
            "You'll need at least five prerequisites, with mostly A's and B's. Then the program pays for the rest.", 0.4),
 ("commit", "In return, you'll work three years as an R.N. with us.", "In return, you'll work three years as an RN with us.", 0.5),
 ("step1",  "Next steps. One: join an info session, online or in person. That's how you get the application.",
            "Next steps. One: join an info session, online or in person. That's how you get the application.", 0.3),
 ("step2",  "Two: gather your transcripts and a letter from your supervisor.", "Two: gather your transcripts and a letter from your supervisor.", 0.3),
 ("step3",  "Three: apply by December thirty-first.", "Three: apply by December 31, 2026.", 0.45),
 ("end",    "Your path to R.N. starts here.", "Your path to RN starts here.", 1.4),
]
async def one(i, text):
    c = edge_tts.Communicate(text, VOICE, rate=RATE, boundary="WordBoundary")
    audio = bytearray(); words = []
    async for ch in c.stream():
        if ch["type"] == "audio": audio += ch["data"]
        elif ch["type"] == "WordBoundary":
            words.append({"t": ch["offset"]/1e7, "d": ch["duration"]/1e7, "w": ch["text"]})
    fn = f"seg_{i:02d}.mp3"; open(fn, "wb").write(audio)
    return fn, words
def dur(fn):
    return float(subprocess.check_output(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",fn]).decode().strip())
async def main():
    out = []; t = 0.35  # lead-in silence
    parts = [("sil", 0.35)]
    for i,(sid, spoken, cap, pause) in enumerate(LINES):
        fn, words = await one(i, spoken)
        # decode to wav to get exact duration without mp3 padding issues
        subprocess.run(["ffmpeg","-y","-v","error","-i",fn,"-ar","24000","-ac","1",f"seg_{i:02d}.wav"],check=True)
        d = dur(f"seg_{i:02d}.wav")
        out.append({"id": sid, "start": round(t,3), "end": round(t+d,3), "caption": cap,
                    "words": [{"t": round(t+w["t"],3), "d": round(w["d"],3), "w": w["w"]} for w in words]})
        parts.append((f"seg_{i:02d}.wav", None)); parts.append(("sil", pause))
        t += d + pause
    # build concat list
    with open("list.txt","w") as f:
        k=0
        for p,s in parts:
            if p=="sil":
                sf=f"sil_{k}.wav"; k+=1
                subprocess.run(["ffmpeg","-y","-v","error","-f","lavfi","-i","anullsrc=r=24000:cl=mono","-t",str(s),sf],check=True)
                f.write(f"file '{sf}'\n")
            else: f.write(f"file '{p}'\n")
    subprocess.run(["ffmpeg","-y","-v","error","-f","concat","-safe","0","-i","list.txt","-c","pcm_s16le","narration_full.wav"],check=True)
    json.dump({"voice": VOICE, "duration": round(t,3), "lines": out}, open("narration.json","w"), indent=1)
    print("total", round(t,2), "s"); [print(o["id"], o["start"], o["end"]) for o in out]
asyncio.run(main())
