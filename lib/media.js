// أدوات الوسائط عبر ffmpeg و yt-dlp (ملصقات، تحويل صوت)
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { UserError } = require('./errors');

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4' };

function run(cmd, args, timeout = 120000) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout, maxBuffer: 20 * 1024 * 1024 }, (err, out, stderr) => {
      if (err) { err.stderr = stderr; return reject(err); }
      resolve(out);
    });
  });
}

async function withTmp(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wam-'));
  try { return await fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

const missing = (e, tool, hint) => (e.code === 'ENOENT'
  ? new UserError(`${tool} غير مثبت على الجهاز (${hint}).`)
  : null);

// صورة أو فيديو قصير -> ملصق webp (512x512 بخلفية شفافة)
async function toSticker(buffer, mime, animated) {
  return withTmp(async (dir) => {
    const input = path.join(dir, `in.${EXT[mime] || 'bin'}`);
    const output = path.join(dir, 'out.webp');
    fs.writeFileSync(input, buffer);
    const vf = 'scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000'
      + (animated ? ',fps=15' : '');
    const args = ['-y', '-i', input, '-vf', vf, '-an',
      ...(animated ? ['-t', '8', '-loop', '0', '-q:v', '45'] : ['-frames:v', '1', '-q:v', '75']),
      '-vcodec', 'libwebp', '-lossless', '0', '-preset', 'default', output];
    try { await run(FFMPEG, args); } catch (e) {
      throw missing(e, 'ffmpeg', 'pkg install ffmpeg') || new UserError('ما قدرت أحوّل لملصق.');
    }
    return fs.readFileSync(output);
  });
}

// ملصق (ثابت) -> PNG
async function stickerToPng(buffer) {
  return withTmp(async (dir) => {
    const input = path.join(dir, 'in.webp');
    const output = path.join(dir, 'out.png');
    fs.writeFileSync(input, buffer);
    try { await run(FFMPEG, ['-y', '-i', input, '-frames:v', '1', output]); } catch (e) {
      throw missing(e, 'ffmpeg', 'pkg install ffmpeg') || new UserError('ما قدرت أحوّل الملصق (الملصقات المتحركة غير مدعومة).');
    }
    return fs.readFileSync(output);
  });
}

// فيديو -> MP3
async function videoToMp3(buffer) {
  return withTmp(async (dir) => {
    const input = path.join(dir, 'in.mp4');
    const output = path.join(dir, 'out.mp3');
    fs.writeFileSync(input, buffer);
    try { await run(FFMPEG, ['-y', '-i', input, '-vn', '-c:a', 'libmp3lame', '-q:a', '4', output]); } catch (e) {
      throw missing(e, 'ffmpeg', 'pkg install ffmpeg') || new UserError('ما قدرت أستخرج الصوت من الفيديو.');
    }
    return fs.readFileSync(output);
  });
}

// رابط (يوتيوب/تيك توك...) -> MP3 عبر yt-dlp
async function urlToMp3(url, ytdlp, maxMB = 25) {
  return withTmp(async (dir) => {
    const args = ['--no-playlist', '--no-warnings', '-q', '--no-progress', '--socket-timeout', '10',
      '--max-filesize', `${maxMB}M`, '--match-filter', '!is_live & duration<=?900',
      '-x', '--audio-format', 'mp3', '--audio-quality', '5',
      '-o', path.join(dir, 'audio.%(ext)s'), '--', url];
    try { await run(ytdlp, args, 180000); } catch (e) {
      console.warn('[yt-dlp audio]', (e.stderr || e.message || '').toString().split('\n')[0].slice(0, 200));
      throw missing(e, 'yt-dlp', 'pip install yt-dlp') || new UserError('ما قدرت أحمّل الصوت من الرابط (يمكن طويل أو خاص).');
    }
    const file = fs.readdirSync(dir).find((f) => f.endsWith('.mp3'));
    if (!file) throw new UserError('ما قدرت أحمّل الصوت من الرابط.');
    return fs.readFileSync(path.join(dir, file));
  });
}

module.exports = { toSticker, stickerToPng, videoToMp3, urlToMp3 };
