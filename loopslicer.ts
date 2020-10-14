
function decimate(method: 'max' | 'min' | 'average', ratio: number, data: Float32Array) {
  let decimated = new Float32Array(Math.floor(data.length / ratio));
  let n = 0;
  let sample = 0;
  if (method === 'average') {
    for (let i = 0; i < data.length; i++) {
      sample += data[i];
      n++;
      if (n >= ratio) {
        decimated[(i + 1) / ratio] = sample / ratio;
        n = 0;
        sample = 0;
      }
    }
  } else {
    for (let i = 0; i < data.length; i++) {
      if (n === 0) {
        sample = data[i];
      } else {
        sample = Math[method](sample, data[i]);
      }
      n++;
      if (n >= ratio) {
        decimated[(i + 1) / ratio] = sample;
        n = 0;
      }
    }
  }
  return decimated;
}

function mix(buffer: AudioBuffer) {
  let n = buffer.length;
  let mixed = new Float32Array(n);
  let i: number;
  let ch: number;
  let channel: Float32Array;
  for (ch = 0; ch < buffer.numberOfChannels; ch++) {
    channel = buffer.getChannelData(ch);
    for (i = 0; i < n; i++) {
      mixed[i] += channel[i];
    }
  }
  let k = 1 / buffer.numberOfChannels;
  for (i = 0; i < n; i++) {
    mixed[i] *= k;
  }
  return mixed;
}

function plotWave(data: Float32Array, height: number, decimationRatio: number, sampleRate: number) {
  let max = decimate('max', decimationRatio, data);
  let min = decimate('min', decimationRatio, data);
  let canvas = document.createElement('canvas');
  let ctx = canvas.getContext('2d');
  let width = max.length;
  canvas.width = width;
  canvas.height = height;
  ctx.fillStyle = 'gray';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = 'blue';
  for (let i = 0; i < width; i++) {
    ctx.fillRect(i, (1 - max[i]) * height / 2, 1, (max[i] - min[i]) * height / 2 + 1);
  }
  ctx.fillStyle = 'white';
  ctx.fillRect(0, height / 2, width, 1);
  for (let sec = 0; sec < data.length / sampleRate; sec += 10) {
    ctx.fillRect(sec * sampleRate / decimationRatio, height / 2 - 4, 1, 9);
    ctx.fillText('' + sec, sec * sampleRate / decimationRatio + 1, height / 2 - 1);
  }
  return ctx.getImageData(0, 0, width, height);
}

function plotGraph(data: Float32Array, height: number, decimationRatio: number, method: 'min' | 'max' | 'average', offsetDB: number, scale: number) {
  let decimated = decimate(method, decimationRatio, data);
  let canvas = document.createElement('canvas');
  let ctx = canvas.getContext('2d');
  let width = decimated.length;
  canvas.width = width;
  canvas.height = height;
  ctx.fillStyle = 'gray';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = 'blue';
  for (let i = 0; i < width; i++) {
    let db = 10 * Math.log10(decimated[i]);
    ctx.fillRect(i, Math.max(0, scale * (-db + offsetDB)), 1, height);
  }
  ctx.fillStyle = 'white';
  for (let db = 10; db * scale < height; db += 10) {
    ctx.fillRect(0, db * scale, width, 1);
    ctx.fillText((-db + offsetDB) + 'dB', 0, db * scale);
  }
  return ctx.getImageData(0, 0, width, height);
}

function removeElementById(id: string) {
  let element = document.getElementById(id);
  if (element) {
    element.parentElement.removeChild(element);
  }
}

function removeElementsByTagName(name: string) {
  while (true) {
    let elements = document.getElementsByTagName(name);
    if (elements.length === 0) {
      break;
    }
    elements[0].parentElement.removeChild(elements[0]);
  }
}

function searchMin(data: Float32Array) {
  let min = data[0];
  let iMin = 0;
  for (let i = 0; i < data.length; i++) {
    if (data[i] < min) {
      min = data[i];
      iMin = i;
    }
  }
  return iMin;
}

function wait(ms: number) {
  return new Promise(function (resolve) { setTimeout(resolve, ms) });
}

function fourcc(str: string) {
  let n = 0;
  n += str.charCodeAt(0);
  n += str.charCodeAt(1) << 8;
  n += str.charCodeAt(2) << 16;
  n += str.charCodeAt(3) << 24;
  return n;
}

function detectSampleType(audioBuffer: AudioBuffer) {
  let threshold = 0.5 / 256;
  let channel: Float32Array;
  let ch: number;
  let i: number;
  let v: number;
  let e = 0;
  for (ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    channel = audioBuffer.getChannelData(ch);
    for (i = 0; i < audioBuffer.length; i++) {
      v = channel[i] * 0x8000;
      e = Math.max(e, Math.abs(Math.round(v) - v));
      if (e >= threshold) {
        break;
      }
    }
  }
  if (e < threshold) {
    return 'Int16';
  }
  e = 0;
  for (ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    channel = audioBuffer.getChannelData(ch);
    for (i = 0; i < audioBuffer.length; i++) {
      v = channel[i] > 0 ? channel[i] * 0x7fff : channel[i] * 0x8000;
      e = Math.max(e, Math.abs(Math.round(v) - v));
      if (e >= threshold) {
        break;
      }
    }
  }
  if (e < threshold) {
    return 'Int16Asymmetric';
  }
  e = 0;
  for (ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    channel = audioBuffer.getChannelData(ch);
    for (i = 0; i < audioBuffer.length; i++) {
      v = channel[i] * 0x800000;
      e = Math.max(e, Math.abs(Math.round(v) - v));
      if (e >= threshold) {
        break;
      }
    }
  }
  if (e < threshold) {
    return 'Int24';
  }
  return 'Float32';
}

function loadWav(buffer: ArrayBuffer) {
  let view = new DataView(buffer);
  if (fourcc('RIFF') !== view.getUint32(0, true)) {
    return null;
  }
  if (fourcc('WAVE') !== view.getUint32(8, true)) {
    return null;
  }
  let cur = 12;
  let format = 0;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  while (true) {
    if (cur + 8 > buffer.byteLength) {
      return null;
    }
    let chunkId = view.getUint32(cur, true);
    let chunkSize = view.getUint32(cur + 4, true);
    if (cur + 8 + chunkSize > buffer.byteLength) {
      return null;
    }
    if (chunkId === fourcc('fmt ')) {
      if (chunkSize < 16) {
        return null;
      }
      format = view.getUint16(cur + 8, true);
      channels = view.getUint16(cur + 10, true);
      sampleRate = view.getUint32(cur + 12, true);
      bitsPerSample = view.getUint16(cur + 22, true);
    }
    if (chunkId === fourcc('data')) {
      if (channels === 0 || sampleRate === 0) {
        return null;
      }
      if (format === 1 && bitsPerSample === 16) {
        let length = Math.floor(chunkSize / (channels * 2));
        let ctx = new OfflineAudioContext(channels, sampleRate, sampleRate);
        let audioBuffer = ctx.createBuffer(channels, length, sampleRate);
        let bytePerBlock = channels * 2;
        let i: number;
        let ch: number;
        let channel: Float32Array;
        let pos: number;
        for (ch = 0; ch < channels; ch++) {
          channel = audioBuffer.getChannelData(ch);
          pos = cur + 8 + ch * 2;
          for (i = 0; i < length; i++) {
            channel[i] = view.getInt16(pos, true) / 0x8000;
            pos += bytePerBlock;
          }
        }
        audioBuffer['sampleType'] = 'Int16';
        return audioBuffer;
      } else if (format === 1 && bitsPerSample === 24) {
        let length = Math.floor(chunkSize / (channels * 3));
        let ctx = new OfflineAudioContext(channels, sampleRate, sampleRate);
        let audioBuffer = ctx.createBuffer(channels, length, sampleRate);
        let bytePerBlock = channels * 3;
        let i: number;
        let ch: number;
        let channel: Float32Array;
        let pos: number;
        let v: number;
        for (ch = 0; ch < channels; ch++) {
          channel = audioBuffer.getChannelData(ch);
          pos = cur + 8 + ch * 3;
          for (i = 0; i < length; i++) {
            v = view.getUint16(pos, true) + (view.getUint8(pos + 2) << 16);
            if (v >= 0x800000) {
              v -= 0x1000000;
            }
            channel[i] = v / 0x800000;
            pos += bytePerBlock;
          }
        }
        audioBuffer['sampleType'] = 'Int24';
        return audioBuffer;
      } else if (format === 3 && bitsPerSample === 32) {
        let length = Math.floor(chunkSize / (channels * 4));
        let ctx = new OfflineAudioContext(channels, sampleRate, sampleRate);
        let audioBuffer = ctx.createBuffer(channels, length, sampleRate);
        let bytePerBlock = channels * 4;
        let i: number;
        let ch: number;
        let channel: Float32Array;
        let pos: number;
        for (ch = 0; ch < channels; ch++) {
          channel = audioBuffer.getChannelData(ch);
          pos = cur + 8 + ch * 4;
          for (i = 0; i < length; i++) {
            channel[i] = view.getFloat32(pos, true);
            pos += bytePerBlock;
          }
        }
        audioBuffer['sampleType'] = 'Float32';
        return audioBuffer;
      } else {
        return null;
      }
    }
    cur += 8 + chunkSize;
  }
}

function writeWav(audioBuffer: AudioBuffer, offset: number, length: number, sampleType: string) {
  let bytePerSample = 2;
  if (sampleType === 'Int16' || sampleType === 'Int16Asymmetric') {
    bytePerSample = 2;
  } else if (sampleType === 'Int24') {
    bytePerSample = 3;
  } else if (sampleType === 'Float32') {
    bytePerSample = 4;
  } else {
    return null;
  }
  let buf = new ArrayBuffer(audioBuffer.numberOfChannels * bytePerSample * length + 0x2c);
  let view = new DataView(buf);
  let cur = 0;
  let u32 = function (n: number) {
    view.setUint32(cur, n, true);
    cur += 4;
  };
  let u16 = function (n: number) {
    view.setUint16(cur, n, true);
    cur += 2;
  };
  u32(fourcc('RIFF'));
  u32(buf.byteLength - 8);
  u32(fourcc('WAVE'));
  u32(fourcc('fmt '));
  u32(16);
  u16(bytePerSample >= 4 ? 3 : 1);
  u16(audioBuffer.numberOfChannels);
  u32(audioBuffer.sampleRate);
  u32(audioBuffer.sampleRate * audioBuffer.numberOfChannels * bytePerSample);
  u16(audioBuffer.numberOfChannels * bytePerSample);
  u16(8 * bytePerSample);
  u32(fourcc('data'));
  u32(audioBuffer.numberOfChannels * bytePerSample * length);
  let i: number;
  let ch: number;
  let pos: number;
  let n: number;
  let channel: Float32Array;
  let bytePerBlock = bytePerSample * audioBuffer.numberOfChannels;
  if (sampleType === 'Int16') {
    for (ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
      pos = cur + bytePerSample * ch;
      channel = audioBuffer.getChannelData(ch);
      for (i = offset; i < offset + length; i++) {
        n = Math.round(channel[i] * 0x8000);
        view.setInt16(pos, n, true);
        pos += bytePerBlock;
      }
    }
  }
  if (sampleType === 'Int16Asymmetric') {
    for (ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
      pos = cur + bytePerSample * ch;
      channel = audioBuffer.getChannelData(ch);
      for (i = offset; i < offset + length; i++) {
        n = Math.round(channel[i] > 0 ? channel[i] * 0x7fff : channel[i] * 0x8000);
        view.setInt16(pos, n, true);
        pos += bytePerBlock;
      }
    }
  }
  if (sampleType === 'Int24') {
    for (ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
      pos = cur + bytePerSample * ch;
      channel = audioBuffer.getChannelData(ch);
      for (i = offset; i < offset + length; i++) {
        n = Math.round(channel[i] * 0x800000);
        view.setUint16(pos, n, true);
        view.setUint8(pos + 2, n >> 16);
        pos += bytePerBlock;
      }
    }
  }
  if (sampleType === 'Float32') {
    for (ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
      pos = cur + bytePerSample * ch;
      channel = audioBuffer.getChannelData(ch);
      for (i = offset; i < offset + length; i++) {
        view.setFloat32(pos, channel[i], true);
        pos += bytePerBlock;
      }
    }
  }
  return new Blob([buf], { type: 'audio/wav' });
}

function timeString(time: number, sampleRate: number) {
  return time.toFixed(Math.floor(Math.log10(sampleRate)) + 2);
}

let g_configGraphTimescale = 4096;
let g_configWindowSize = 32;
let g_configSnapDistance = 32;
let g_configSseThreshold = 0.0001;
let g_configDecimationRatio = 1;
let g_configSliceWindow = [0.4, 0.2, 0.2, 0.2];

let g_audioSource = <AudioBufferSourceNode>null;
let g_audioBuffer = <AudioBuffer>null;
let g_mixedData = <Float32Array>null;
let g_waveImage = <ImageData>null;
let g_filename = '';
let g_sampleType = '';

let g_stepManager: StepManager;

function stop() {
  try {
    g_audioSource.stop();
  } catch (e) { }
}

function play(start?: number, loopBegin?: number, loopEnd?: number) {
  stop();
  if (g_audioBuffer) {
    let audioCtx = new AudioContext();
    g_audioSource = audioCtx.createBufferSource();
    g_audioSource.connect(audioCtx.destination);
    g_audioSource.buffer = g_audioBuffer;
    if (loopBegin !== (void 0) && loopEnd !== (void 0)) {
      g_audioSource.loopStart = loopBegin;
      g_audioSource.loopEnd = loopEnd;
      g_audioSource.loop = true;
    }
    g_audioSource.start(0, start);
  }
}

interface Step {
  initialize(): void;
  show(): void | Promise<void>;
  hide(): void;
  reset(loopBegin: number, loopEnd: number): void;
}

class StepManager {
  private step1: Step1;
  private step2: Step2;
  private step3: Step3;
  private step4: Step4;
  private step5: Step5;
  private currentStep = 0;
  private next() {
    switch (this.currentStep) {
      case 1:
        this.step1.hide();
        this.currentStep++;
        this.step2.show();
        break;
      case 2:
        this.step2.hide();
        this.currentStep++;
        this.step3.show();
        break;
      case 3:
        this.step3.hide();
        this.currentStep++;
        this.step4.show();
        break;
      case 4:
        this.step4.hide();
        this.currentStep++;
        this.step5.show();
        break;
    }
  }
  private prev() {
    switch (this.currentStep) {
      case 5:
        this.step5.hide();
        this.currentStep--;
        this.step4.show();
        break;
      case 4:
        this.step4.hide();
        this.currentStep--;
        this.step3.show();
        break;
      case 3:
        this.step3.hide();
        this.currentStep--;
        this.step2.show();
        break;
      case 2:
        this.step2.hide();
        this.currentStep--;
        this.step1.show();
        break;
    }
  }
  public initialize() {
    this.step1 = new Step1();
    this.step2 = new Step2();
    this.step3 = new Step3();
    this.step4 = new Step4();
    this.step5 = new Step5();
    this.step1.initialize();
    this.step2.initialize();
    this.step3.initialize();
    this.step4.initialize();
    this.step5.initialize();
  }
  public start() {
    let prevElement = <HTMLInputElement>document.getElementById('prev');
    let nextElement = <HTMLInputElement>document.getElementById('next');
    prevElement.onclick = function () {
      g_stepManager.prev();
    };
    nextElement.onclick = function () {
      g_stepManager.next();
    };
    document.addEventListener('dragover', function (e) {
      e.stopPropagation();
      e.preventDefault();
      g_stepManager.restart();
    });
    this.currentStep = 1;
    this.step1.show();
  }
  public resetLaterSteps(loopBegin: number, loopEnd: number) {
    switch (this.currentStep) {
      case 0:
        this.step1.reset(loopBegin, loopEnd);
      /* fall through */
      case 1:
        this.step2.reset(loopBegin, loopEnd);
      /* fall through */
      case 2:
        this.step3.reset(loopBegin, loopEnd);
      /* fall through */
      case 3:
        this.step4.reset(loopBegin, loopEnd);
      /* fall through */
      case 4:
        this.step5.reset(loopBegin, loopEnd);
      /* fall through */
      case 5:
      default:
        break;
    }
  }
  public restart() {
    switch (this.currentStep) {
      case 2:
        this.step2.hide();
        this.currentStep = 1;
        this.step1.show();
      case 3:
        this.step3.hide();
        this.currentStep = 1;
        this.step1.show();
      case 4:
        this.step4.hide();
        this.currentStep = 1;
        this.step1.show();
      case 5:
        this.step5.hide();
        this.currentStep = 1;
        this.step1.show();
    }
  }
}

class Step1 implements Step {
  private myondragover: (e: DragEvent) => void;
  private myondrop: (e: DragEvent) => void;
  constructor() {
    let currentStep = this;
    this.myondragover = function (e: DragEvent) {
      e.stopPropagation();
      e.preventDefault();
    };
    this.myondrop = function (e: DragEvent) {
      let filenameElement = <HTMLDivElement>document.getElementById('step1_filename');
      let typeElement = <HTMLDivElement>document.getElementById('step1_type');
      let typewarningElement = <HTMLDivElement>document.getElementById('step1_typewarning');
      let stopElement = <HTMLInputElement>document.getElementById('step1_stop');
      let alertElement = <HTMLDivElement>document.getElementById('step1_alert');
      let nextElement = <HTMLInputElement>document.getElementById('next');
      e.stopPropagation();
      e.preventDefault();
      nextElement.disabled = true;
      let file = e.dataTransfer.files[0];
      let reader = new FileReader();
      reader.onload = async function (e) {
        let buffer = loadWav(<ArrayBuffer>reader.result);
        let type = '';
        if (buffer) {
          type = buffer['sampleType'];
        } else {
          for (let sampleRate of [44100, 48000, 96000, 192000, 32000, 64000, 128000, 88200, 176400, 24000, 22050, 16000, 12000, 11025, 8000]) {
            try {
              let offlineAudioCtx = new OfflineAudioContext(2, sampleRate, sampleRate);
              let tmpBuffer = await offlineAudioCtx.decodeAudioData((<ArrayBuffer>reader.result).slice(0));
              if (tmpBuffer) {
                let t = Date.now();
                let tmpType = detectSampleType(tmpBuffer);
                console.log(Date.now() - t);
                if (tmpType !== 'Float32') {
                  buffer = tmpBuffer;
                  type = tmpType;
                  break;
                }
                if (sampleRate === 192000) {
                  buffer = tmpBuffer;
                  type = tmpType;
                }
              }
            } catch (e) { }
          }
        }
        if (buffer) {
          g_audioBuffer = buffer;
          g_sampleType = type;
          let sampleTypeString = 'unknown sample format';
          if (g_sampleType === 'Int16' || g_sampleType === 'Int16Asymmetric') {
            sampleTypeString = '16bit Linear PCM';
          } else if (g_sampleType === 'Int24') {
            sampleTypeString = '24bit Linear PCM';
          } else if (g_sampleType === 'Float32') {
            sampleTypeString = '32bit IEEE 754 Float PCM';
          }
          typeElement.innerText = g_audioBuffer.numberOfChannels + 'ch x ' + g_audioBuffer.sampleRate + 'Hz ' + sampleTypeString;
          if (g_sampleType === 'Float32' && !buffer['sampleType']) {
            typewarningElement.style.display = 'block';
          } else {
            typewarningElement.style.display = 'none';
          }
          typeElement.appendChild
          stopElement.click();
          g_filename = file.name.match(/^(.+?)(\.[^.]*)?$/)[1];
          filenameElement.innerText = file.name;
          await wait(1);
          g_mixedData = mix(g_audioBuffer);
          g_waveImage = plotWave(g_mixedData, 128, g_configGraphTimescale, g_audioBuffer.sampleRate);
          g_stepManager.resetLaterSteps(0, 1 / g_audioBuffer.sampleRate);
          currentStep.updateWave();
          nextElement.disabled = false;
          alertElement.style.display = 'none';
        } else {
          alertElement.style.display = 'block';
          if (g_audioBuffer) {
            nextElement.disabled = false;
          }
        }
      };
      reader.readAsArrayBuffer(file);
    };
  }
  private updateWave() {
    let waveElement = <HTMLCanvasElement>document.getElementById('step1_wave');
    waveElement.width = g_waveImage.width;
    waveElement.height = g_waveImage.height;
    waveElement.getContext('2d').putImageData(g_waveImage, 0, 0);
  }
  public initialize() {
    let playElement = <HTMLInputElement>document.getElementById('step1_play');
    let stopElement = <HTMLInputElement>document.getElementById('step1_stop');
    let testElement = <HTMLAnchorElement>document.getElementById('step1_test');
    playElement.onclick = function () {
      play();
    };
    stopElement.onclick = stop;
    testElement.onclick = function () {
      if (g_audioBuffer) {
        testElement.download = g_filename + '_test.wav';
        let blob = writeWav(g_audioBuffer, 0, g_audioBuffer.length, g_sampleType);
        testElement.href = URL.createObjectURL(blob);
      }
    };
  }
  public show() {
    let stepElement = <HTMLDivElement>document.getElementById('step1');
    let alertElement = <HTMLDivElement>document.getElementById('step1_alert');
    let prevElement = <HTMLInputElement>document.getElementById('prev');
    let nextElement = <HTMLInputElement>document.getElementById('next');
    stepElement.style.display = 'block';
    alertElement.style.display = 'none';
    prevElement.disabled = true;
    nextElement.disabled = !g_audioBuffer;
    document.addEventListener('dragover', this.myondragover);
    document.addEventListener('drop', this.myondrop);
  }
  public hide() {
    let stepElement = <HTMLDivElement>document.getElementById('step1');
    let stopElement = <HTMLInputElement>document.getElementById('step1_stop');
    document.removeEventListener('dragover', this.myondragover);
    document.removeEventListener('drop', this.myondrop);
    stopElement.click();
    stepElement.style.display = 'none';
  }
  public reset(loopBegin: number, loopEnd: number) {
  }
}

class Step2 implements Step {
  private loopBegin: number;
  private updateWave() {
    let waveElement = <HTMLCanvasElement>document.getElementById('step2_wave');
    let ctx = waveElement.getContext('2d');
    waveElement.width = g_waveImage.width;
    waveElement.height = g_waveImage.height;
    ctx.putImageData(g_waveImage, 0, 0);
    ctx.fillStyle = 'red';
    ctx.fillRect(this.loopBegin * g_audioBuffer.sampleRate / g_configGraphTimescale, 0, 1, waveElement.height);
  }
  private updateForm() {
    let loopbeginElement = <HTMLInputElement>document.getElementById('step2_loopbegin');
    let loopbeginsampleElement = <HTMLInputElement>document.getElementById('step2_loopbeginsample');
    loopbeginElement.value = timeString(this.loopBegin, g_audioBuffer.sampleRate);
    loopbeginsampleElement.value = '' + Math.round(this.loopBegin * g_audioBuffer.sampleRate);
  }
  private setLoopBegin(loopBegin: number) {
    let iBegin = Math.round(loopBegin * g_audioBuffer.sampleRate);
    let upperLimit = g_audioBuffer.length - g_configWindowSize - 1;
    this.loopBegin = Math.max(0, Math.min(iBegin, upperLimit)) / g_audioBuffer.sampleRate;
  }
  public initialize() {
    let currentStep = this;
    let waveElement = <HTMLCanvasElement>document.getElementById('step2_wave');
    let loopbeginElement = <HTMLInputElement>document.getElementById('step2_loopbegin');
    let loopbeginsampleElement = <HTMLInputElement>document.getElementById('step2_loopbeginsample');
    let playElement = <HTMLInputElement>document.getElementById('step2_play');
    let stopElement = <HTMLInputElement>document.getElementById('step2_stop');
    let openadvancedElement = <HTMLAnchorElement>document.getElementById('step2_openadvanced');
    let advancedElement = <HTMLDivElement>document.getElementById('step2_advanced');
    let windowsizeElement = <HTMLInputElement>document.getElementById('step2_windowsize');
    let ssethresholdElement = <HTMLInputElement>document.getElementById('step2_ssethreshold');
    let decimationratioElement = <HTMLInputElement>document.getElementById('step2_decimationratio');
    loopbeginElement.onchange = function () {
      currentStep.setLoopBegin(+loopbeginElement.value);
      currentStep.updateWave();
      currentStep.updateForm();
      g_stepManager.resetLaterSteps(currentStep.loopBegin, currentStep.loopBegin + 1 / g_audioBuffer.sampleRate);
    };
    loopbeginsampleElement.onchange = function () {
      currentStep.setLoopBegin(+loopbeginsampleElement.value / g_audioBuffer.sampleRate);
      currentStep.updateWave();
      currentStep.updateForm();
      g_stepManager.resetLaterSteps(currentStep.loopBegin, currentStep.loopBegin + 1 / g_audioBuffer.sampleRate);
    };
    playElement.onclick = function () {
      play(currentStep.loopBegin);
    };
    stopElement.onclick = stop;
    waveElement.onclick = function (e) {
      currentStep.setLoopBegin(e.offsetX * g_configGraphTimescale / g_audioBuffer.sampleRate);
      currentStep.updateWave();
      currentStep.updateForm();
      g_stepManager.resetLaterSteps(currentStep.loopBegin, currentStep.loopBegin + 1 / g_audioBuffer.sampleRate);
    };
    openadvancedElement.onclick = function () {
      advancedElement.style.display = (advancedElement.style.display === 'none' ? 'block' : 'none');
      return false;
    };
    windowsizeElement.onchange = function () {
      let v = Math.max(1, Math.floor(+windowsizeElement.value));
      windowsizeElement.value = '' + v;
      g_configWindowSize = v;
      g_stepManager.resetLaterSteps(currentStep.loopBegin, currentStep.loopBegin + 1 / g_audioBuffer.sampleRate);
    };
    ssethresholdElement.onchange = function () {
      let v = Math.max(0, +ssethresholdElement.value);
      ssethresholdElement.value = '' + v;
      g_configSseThreshold = v;
      g_stepManager.resetLaterSteps(currentStep.loopBegin, currentStep.loopBegin + 1 / g_audioBuffer.sampleRate);
    };
    decimationratioElement.onchange = function () {
      let v = Math.max(1, Math.floor(+decimationratioElement.value));
      decimationratioElement.value = '' + v;
      g_configDecimationRatio = v;
      g_stepManager.resetLaterSteps(currentStep.loopBegin, currentStep.loopBegin + 1 / g_audioBuffer.sampleRate);
    };
  }
  public show() {
    let stepElement = <HTMLDivElement>document.getElementById('step2');
    let windowsizeElement = <HTMLInputElement>document.getElementById('step2_windowsize');
    let ssethresholdElement = <HTMLInputElement>document.getElementById('step2_ssethreshold');
    let decimationratioElement = <HTMLInputElement>document.getElementById('step2_decimationratio');
    let prevElement = <HTMLInputElement>document.getElementById('prev');
    let nextElement = <HTMLInputElement>document.getElementById('next');
    stepElement.style.display = 'block';
    windowsizeElement.value = '' + g_configWindowSize;
    ssethresholdElement.value = '' + g_configSseThreshold;
    decimationratioElement.value = '' + g_configDecimationRatio;
    prevElement.disabled = false;
    nextElement.disabled = false;
    this.updateWave();
    this.updateForm();
  }
  public hide() {
    let stepElement = <HTMLDivElement>document.getElementById('step2');
    let stopElement = <HTMLInputElement>document.getElementById('step2_stop');
    stopElement.click();
    stepElement.style.display = 'none';
  }
  public reset(loopBegin: number, loopEnd: number) {
    this.loopBegin = loopBegin;
  }
}

class Step3 implements Step {
  private valid = false;
  private loopBegin: number;
  private loopEnd: number;
  private errorTable: Float32Array;
  private graphImage: ImageData;
  private abortFlag: boolean;
  private updateWave() {
    let waveElement = <HTMLCanvasElement>document.getElementById('step3_wave');
    let ctx = waveElement.getContext('2d');
    waveElement.width = g_waveImage.width;
    waveElement.height = g_waveImage.height;
    ctx.putImageData(g_waveImage, 0, 0);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(this.loopBegin * g_audioBuffer.sampleRate / g_configGraphTimescale, 0,
      (this.loopEnd - this.loopBegin) * g_audioBuffer.sampleRate / g_configGraphTimescale, waveElement.height);
    ctx.fillStyle = 'red';
    ctx.fillRect(this.loopEnd * g_audioBuffer.sampleRate / g_configGraphTimescale, 0, 1, waveElement.height);
  }
  private updateGraph() {
    let graphElement = <HTMLCanvasElement>document.getElementById('step3_graph');
    let ctx = graphElement.getContext('2d');
    graphElement.width = this.graphImage.width;
    graphElement.height = this.graphImage.height;
    ctx.putImageData(this.graphImage, 0, 0);
    ctx.fillStyle = 'red';
    ctx.fillRect(this.loopEnd * g_audioBuffer.sampleRate / g_configGraphTimescale, 0, 1, graphElement.height);
  }
  private updateForm() {
    let loopbeginElement = <HTMLInputElement>document.getElementById('step3_loopbegin');
    let loopbeginsampleElement = <HTMLInputElement>document.getElementById('step3_loopbeginsample');
    let loopendElement = <HTMLInputElement>document.getElementById('step3_loopend');
    let loopendsampleElement = <HTMLInputElement>document.getElementById('step3_loopendsample');
    loopbeginElement.value = timeString(this.loopBegin, g_audioBuffer.sampleRate);
    loopbeginsampleElement.value = '' + Math.round(this.loopBegin * g_audioBuffer.sampleRate);
    loopendElement.value = timeString(this.loopEnd, g_audioBuffer.sampleRate);
    loopendsampleElement.value = '' + Math.round(this.loopEnd * g_audioBuffer.sampleRate);
  }
  private setLoopEnd(loopEnd: number) {
    if (loopEnd <= this.loopBegin) {
      this.loopEnd = this.loopBegin + 1 / g_audioBuffer.sampleRate;
    } else {
      let iEnd = Math.round(loopEnd * g_audioBuffer.sampleRate);
      if (iEnd > g_audioBuffer.length) {
        this.loopEnd = g_audioBuffer.length / g_audioBuffer.sampleRate;
      } else {
        this.loopEnd = iEnd / g_audioBuffer.sampleRate;
      }
    }
  }
  public initialize() {
    let currentStep = this;
    let waveElement = <HTMLCanvasElement>document.getElementById('step3_wave');
    let graphElement = <HTMLCanvasElement>document.getElementById('step3_graph');
    let loopendElement = <HTMLInputElement>document.getElementById('step3_loopend');
    let loopendsampleElement = <HTMLInputElement>document.getElementById('step3_loopendsample');
    let playElement = <HTMLInputElement>document.getElementById('step3_play');
    let playlastElement = <HTMLInputElement>document.getElementById('step3_playlast');
    let stopElement = <HTMLInputElement>document.getElementById('step3_stop');
    loopendElement.onchange = function () {
      currentStep.setLoopEnd(+loopendElement.value);
      currentStep.updateWave();
      currentStep.updateGraph();
      currentStep.updateForm();
      g_stepManager.resetLaterSteps(currentStep.loopBegin, currentStep.loopEnd);
    };
    loopendsampleElement.onchange = function () {
      currentStep.setLoopEnd(+loopendsampleElement.value / g_audioBuffer.sampleRate);
      currentStep.updateWave();
      currentStep.updateGraph();
      currentStep.updateForm();
      g_stepManager.resetLaterSteps(currentStep.loopBegin, currentStep.loopEnd);
    };
    playElement.onclick = function () {
      if (currentStep.loopBegin < currentStep.loopEnd) {
        play(currentStep.loopBegin, currentStep.loopBegin, currentStep.loopEnd);
      }
    };
    playlastElement.onclick = function () {
      if (currentStep.loopBegin < currentStep.loopEnd) {
        play(currentStep.loopEnd - 3, currentStep.loopBegin, currentStep.loopEnd);
      }
    };
    stopElement.onclick = stop;
    waveElement.onmousemove = graphElement.onmousemove = function (e) {
      currentStep.updateWave();
      currentStep.updateGraph();
      let x = e.offsetX * g_configGraphTimescale;
      let left = Math.max(0, x - g_configGraphTimescale * g_configSnapDistance);
      let right = Math.min(currentStep.errorTable.length - 1, x + g_configGraphTimescale * g_configSnapDistance);
      let iMin = searchMin(currentStep.errorTable.slice(left, right)) + left;
      if (iMin === left) {
        iMin = Math.max(currentStep.loopBegin * g_audioBuffer.sampleRate + 1, x);
      }
      let ctxWave = waveElement.getContext('2d');
      ctxWave.fillStyle = 'white';
      ctxWave.fillRect(iMin / g_configGraphTimescale, 0, 1, waveElement.height);
      let ctxGraph = graphElement.getContext('2d');
      ctxGraph.fillStyle = 'white';
      ctxGraph.fillRect(iMin / g_configGraphTimescale, 0, 1, graphElement.height);
    };
    waveElement.onclick = graphElement.onclick = function (e) {
      let x = e.offsetX * g_configGraphTimescale;
      let left = Math.max(0, x - g_configGraphTimescale * g_configSnapDistance);
      let right = Math.min(currentStep.errorTable.length - 1, x + g_configGraphTimescale * g_configSnapDistance);
      let iMin = searchMin(currentStep.errorTable.slice(left, right)) + left;
      if (iMin === left) {
        iMin = Math.max(currentStep.loopBegin * g_audioBuffer.sampleRate + 1, x);
      }
      currentStep.setLoopEnd(iMin / g_audioBuffer.sampleRate);
      currentStep.updateWave();
      currentStep.updateGraph();
      currentStep.updateForm();
      g_stepManager.resetLaterSteps(currentStep.loopBegin, currentStep.loopEnd);
    };
  }
  public async show() {
    let currentStep = this;
    let stepElement = <HTMLDivElement>document.getElementById('step3');
    let contentElement = <HTMLDivElement>document.getElementById('step3_content');
    let progressElement = <HTMLDivElement>document.getElementById('step3_progress');
    let alertElement = <HTMLDivElement>document.getElementById('step3_alert');
    let prevElement = <HTMLInputElement>document.getElementById('prev');
    let nextElement = <HTMLInputElement>document.getElementById('next');
    stepElement.style.display = 'block';
    alertElement.style.display = 'none';
    currentStep.abortFlag = false;
    if (!currentStep.valid) {
      prevElement.disabled = true;
      nextElement.disabled = true;
      contentElement.style.display = 'none';
      let errorTable = new Float32Array(g_audioBuffer.length - g_configWindowSize + 1);
      let iBegin = Math.round(currentStep.loopBegin * g_audioBuffer.sampleRate);
      let iMin = 0;
      let min = 1;
      let th = g_configSseThreshold * g_configWindowSize;
      let offsetDB = 10 * Math.log10(g_configSseThreshold);
      let sse: number;
      let d: number;
      let j: number;
      for (let i = iBegin + 1; i < errorTable.length; i++) {
        if (i % 262144 === 0) {
          progressElement.innerText = 'searching: ' + (i - iBegin) + ' / ' + (errorTable.length - iBegin);
          await wait(1);
          if (currentStep.abortFlag) {
            return;
          }
        }
        sse = 0;
        for (j = 0; j < g_configWindowSize; j += g_configDecimationRatio) {
          d = g_mixedData[iBegin + j] - g_mixedData[i + j];
          sse += d * d;
          if (sse > th) {
            sse = g_configWindowSize;
            break;
          }
        }
        errorTable[i] = sse / g_configWindowSize;
        if (errorTable[i] < min) {
          iMin = i;
          min = errorTable[i];
        }
      }
      if (iMin === 0) {
        alertElement.style.display = 'block';
      }
      currentStep.setLoopEnd(iMin / g_audioBuffer.sampleRate);
      currentStep.valid = true;
      currentStep.errorTable = errorTable;
      currentStep.graphImage = plotGraph(errorTable, 256, g_configGraphTimescale, 'min', offsetDB, 2);
      g_stepManager.resetLaterSteps(currentStep.loopBegin, currentStep.loopEnd);
    }
    currentStep.updateWave();
    currentStep.updateGraph();
    currentStep.updateForm();
    contentElement.style.display = 'block';
    progressElement.innerText = '';
    prevElement.disabled = false;
    nextElement.disabled = false;
  }
  public hide() {
    this.abortFlag = true;
    let stepElement = <HTMLDivElement>document.getElementById('step3');
    let stopElement = <HTMLInputElement>document.getElementById('step3_stop');
    stopElement.click();
    stepElement.style.display = 'none';
  }
  public reset(loopBegin: number, loopEnd: number) {
    this.valid = false;
    this.loopBegin = loopBegin;
    this.loopEnd = loopEnd;
    this.errorTable = null;
    this.graphImage = null;
  }
}

class Step4 implements Step {
  private valid = false;
  private iLoopInterval: number;
  private loopBegin: number;
  private loopEnd: number;
  private errorTable: Float32Array;
  private graphImage: ImageData;
  private updateWave() {
    let waveElement = <HTMLCanvasElement>document.getElementById('step4_wave');
    let ctx = waveElement.getContext('2d');
    waveElement.width = g_waveImage.width;
    waveElement.height = g_waveImage.height;
    ctx.putImageData(g_waveImage, 0, 0);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(this.loopBegin * g_audioBuffer.sampleRate / g_configGraphTimescale, 0,
      (this.loopEnd - this.loopBegin) * g_audioBuffer.sampleRate / g_configGraphTimescale, waveElement.height);
    ctx.fillStyle = 'red';
    ctx.fillRect(this.loopBegin * g_audioBuffer.sampleRate / g_configGraphTimescale, 0, 1, waveElement.height);
  }
  private updateGraph() {
    let graphElement = <HTMLCanvasElement>document.getElementById('step4_graph');
    let ctx = graphElement.getContext('2d');
    graphElement.width = this.graphImage.width;
    graphElement.height = this.graphImage.height;
    ctx.putImageData(this.graphImage, 0, 0);
    ctx.fillStyle = 'red';
    ctx.fillRect(this.loopBegin * g_audioBuffer.sampleRate / g_configGraphTimescale, 0, 1, graphElement.height);
  }
  private updateForm() {
    let loopbeginElement = <HTMLInputElement>document.getElementById('step4_loopbegin');
    let loopbeginsampleElement = <HTMLInputElement>document.getElementById('step4_loopbeginsample');
    let loopendElement = <HTMLInputElement>document.getElementById('step4_loopend');
    let loopendsampleElement = <HTMLInputElement>document.getElementById('step4_loopendsample');
    loopbeginElement.value = timeString(this.loopBegin, g_audioBuffer.sampleRate);
    loopbeginsampleElement.value = '' + Math.round(this.loopBegin * g_audioBuffer.sampleRate);
    loopendElement.value = timeString(this.loopEnd, g_audioBuffer.sampleRate);
    loopendsampleElement.value = '' + Math.round(this.loopEnd * g_audioBuffer.sampleRate);
  }
  private setLoopBegin(loopBegin: number) {
    if (loopBegin <= 0) {
      this.loopBegin = 0;
      this.loopEnd = this.iLoopInterval / g_audioBuffer.sampleRate;
    } else {
      let iBegin = Math.round(loopBegin * g_audioBuffer.sampleRate);
      if (iBegin + this.iLoopInterval > g_audioBuffer.length) {
        this.loopBegin = (g_audioBuffer.length - this.iLoopInterval) / g_audioBuffer.sampleRate;
        this.loopEnd = g_audioBuffer.length / g_audioBuffer.sampleRate;
      } else {
        this.loopBegin = iBegin / g_audioBuffer.sampleRate;
        this.loopEnd = (iBegin + this.iLoopInterval) / g_audioBuffer.sampleRate;
      }
    }
  }
  public initialize() {
    let currentStep = this;
    let waveElement = <HTMLCanvasElement>document.getElementById('step4_wave');
    let graphElement = <HTMLCanvasElement>document.getElementById('step4_graph');
    let loopbeginElement = <HTMLInputElement>document.getElementById('step4_loopbegin');
    let loopbeginsampleElement = <HTMLInputElement>document.getElementById('step4_loopbeginsample');
    let playElement = <HTMLInputElement>document.getElementById('step4_play');
    let playlastElement = <HTMLInputElement>document.getElementById('step4_playlast');
    let stopElement = <HTMLInputElement>document.getElementById('step4_stop');
    loopbeginElement.onchange = function () {
      currentStep.setLoopBegin(+loopbeginElement.value);
      currentStep.updateWave();
      currentStep.updateGraph();
      currentStep.updateForm();
      g_stepManager.resetLaterSteps(currentStep.loopBegin, currentStep.loopEnd);
    };
    loopbeginsampleElement.onchange = function () {
      currentStep.setLoopBegin(+loopbeginsampleElement.value / g_audioBuffer.sampleRate);
      currentStep.updateWave();
      currentStep.updateGraph();
      currentStep.updateForm();
      g_stepManager.resetLaterSteps(currentStep.loopBegin, currentStep.loopEnd);
    };
    playElement.onclick = function () {
      if (currentStep.loopBegin < currentStep.loopEnd) {
        play(currentStep.loopBegin, currentStep.loopBegin, currentStep.loopEnd);
      }
    };
    playlastElement.onclick = function () {
      if (currentStep.loopBegin < currentStep.loopEnd) {
        play(currentStep.loopEnd - 3, currentStep.loopBegin, currentStep.loopEnd);
      }
    };
    stopElement.onclick = stop;
    waveElement.onmousemove = graphElement.onmousemove = function (e) {
      currentStep.updateWave();
      currentStep.updateGraph();
      let x = e.offsetX * g_configGraphTimescale;
      let left = Math.max(0, x - g_configGraphTimescale * g_configSnapDistance);
      let right = Math.min(currentStep.errorTable.length - 1, x + g_configGraphTimescale * g_configSnapDistance);
      let iMin = searchMin(currentStep.errorTable.slice(left, right)) + left;
      let ctxWave = waveElement.getContext('2d');
      ctxWave.fillStyle = 'white';
      ctxWave.fillRect(iMin / g_configGraphTimescale, 0, 1, waveElement.height);
      let ctxGraph = graphElement.getContext('2d');
      ctxGraph.fillStyle = 'white';
      ctxGraph.fillRect(iMin / g_configGraphTimescale, 0, 1, graphElement.height);
    };
    waveElement.onclick = graphElement.onclick = function (e) {
      let x = e.offsetX * g_configGraphTimescale;
      let left = Math.max(0, x - g_configGraphTimescale * g_configSnapDistance);
      let right = Math.min(currentStep.errorTable.length - 1, x + g_configGraphTimescale * g_configSnapDistance);
      let iMin = searchMin(currentStep.errorTable.slice(left, right)) + left;
      currentStep.setLoopBegin(iMin / g_audioBuffer.sampleRate);
      currentStep.updateWave();
      currentStep.updateGraph();
      currentStep.updateForm();
      g_stepManager.resetLaterSteps(currentStep.loopBegin, currentStep.loopEnd);
    };
  }
  public show() {
    let currentStep = this;
    let stepElement = <HTMLDivElement>document.getElementById('step4');
    let prevElement = <HTMLInputElement>document.getElementById('prev');
    let nextElement = <HTMLInputElement>document.getElementById('next');
    if (!currentStep.valid) {
      let iLoopInterval = currentStep.iLoopInterval;
      let errorTable = new Float32Array(g_audioBuffer.length - iLoopInterval);
      for (let i = 0; i < errorTable.length; i++) {
        let dd = 0;
        for (let j = 0; j < g_configSliceWindow.length; j++) {
          let d = g_mixedData[i + j] - g_mixedData[iLoopInterval + i + j];
          dd += d * d * g_configSliceWindow[j];
        }
        errorTable[i] = dd;
      }
      currentStep.graphImage = plotGraph(errorTable, 256, g_configGraphTimescale, 'min', 0, 2);
      currentStep.errorTable = errorTable;
      currentStep.valid = true;
    }
    stepElement.style.display = 'block';
    currentStep.updateWave();
    currentStep.updateGraph();
    currentStep.updateForm();
    prevElement.disabled = false;
    nextElement.disabled = false;
  }
  public hide() {
    let stepElement = <HTMLDivElement>document.getElementById('step4');
    let stopElement = <HTMLInputElement>document.getElementById('step4_stop');
    stopElement.click();
    stepElement.style.display = 'none';
  }
  public reset(loopBegin: number, loopEnd: number) {
    this.valid = false;
    this.iLoopInterval = Math.round((loopEnd - loopBegin) * g_audioBuffer.sampleRate);
    this.loopBegin = loopBegin;
    this.loopEnd = loopEnd;
    this.errorTable = null;
    this.graphImage = null;
  }
}

class Step5 implements Step {
  private valid = false;
  private loopBegin: number;
  private loopEnd: number;
  public initialize() {
    let headElement = <HTMLAnchorElement>document.getElementById('step5_head');
    let loopElement = <HTMLAnchorElement>document.getElementById('step5_loop');
    let tailElement = <HTMLAnchorElement>document.getElementById('step5_tail');
    let backElement = <HTMLAnchorElement>document.getElementById('step5_back');
    let downloadElement = <HTMLAnchorElement>document.getElementById('step5_download');
    backElement.onclick = function () { g_stepManager.restart() };
    downloadElement.onclick = function () {
      headElement.click();
      loopElement.click();
      tailElement.click();
      return false;
    };
  }
  public show() {
    let currentStep = this;
    let stepElement = <HTMLDivElement>document.getElementById('step5');
    let headElement = <HTMLAnchorElement>document.getElementById('step5_head');
    let loopElement = <HTMLAnchorElement>document.getElementById('step5_loop');
    let tailElement = <HTMLAnchorElement>document.getElementById('step5_tail');
    let prevElement = <HTMLInputElement>document.getElementById('prev');
    let nextElement = <HTMLInputElement>document.getElementById('next');
    stepElement.style.display = 'block';
    if (!currentStep.valid) {
      {
        let length = Math.round(currentStep.loopBegin * g_audioBuffer.sampleRate);
        if (length > 0) {
          let blob = writeWav(g_audioBuffer, 0, length, g_sampleType);
          headElement.href = URL.createObjectURL(blob);
          headElement.download = g_filename + '_head.wav';
          headElement.innerText = headElement.download;
        } else {
          headElement.removeAttribute('href');
          headElement.innerText = g_filename + '_head.wav';
        }
      }
      {
        let begin = Math.round(currentStep.loopBegin * g_audioBuffer.sampleRate);
        let length = Math.round((currentStep.loopEnd - currentStep.loopBegin) * g_audioBuffer.sampleRate);
        if (length > 0) {
          let blob = writeWav(g_audioBuffer, begin, length, g_sampleType);
          loopElement.href = URL.createObjectURL(blob);
          loopElement.download = g_filename + '_loop.wav';
          loopElement.innerText = loopElement.download;
        } else {
          loopElement.removeAttribute('href');
          loopElement.innerText = g_filename + '_head.wav';
        }
      }
      {
        let begin = Math.round(currentStep.loopEnd * g_audioBuffer.sampleRate);
        let length = g_audioBuffer.length - begin;
        if (length > 0) {
          let blob = writeWav(g_audioBuffer, begin, length, g_sampleType);
          tailElement.href = URL.createObjectURL(blob);
          tailElement.download = g_filename + '_tail.wav';
          tailElement.innerText = tailElement.download;
        } else {
          tailElement.removeAttribute('href');
          tailElement.innerText = g_filename + '_head.wav';
        }
      }
      currentStep.valid = true;
    }
    prevElement.disabled = false;
    nextElement.disabled = true;
  }
  public hide() {
    let stepElement = <HTMLDivElement>document.getElementById('step5');
    stepElement.style.display = 'none';
  }
  public reset(loopBegin: number, loopEnd: number) {
    this.valid = false;
    this.loopBegin = loopBegin;
    this.loopEnd = loopEnd;
  }
}

onload = function () {
  g_stepManager = new StepManager();
  g_stepManager.initialize();
  let myondragover = function (e: DragEvent) {
    e.stopPropagation();
    e.preventDefault();
    document.getElementById('step0_start').click();
  };
  document.addEventListener('dragover', myondragover);
  document.getElementById('step0_start').onclick = function () {
    document.getElementById('step0').style.display = 'none';
    document.getElementById('navigation').style.display = 'block';
    document.removeEventListener('dragover', myondragover);
    g_stepManager.start();
    return false;
  };
};
