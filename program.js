let pointStack = [];
const threadsPerThreadgroup = 32;

const sourceBufferBindingNum = 0;
const outputBufferBindingNum = 1;
const uniformsBufferBindingNum = 2;

// Enough space to store 1 radius and 33 weights.
const maxUniformsSize = (32 + 2) * Float32Array.BYTES_PER_ELEMENT;
let image, context2d, resultContext, device;

const lineDrawerCanvas = document.getElementById("lineDrawer");
const resultDrawerCanvas = document.getElementById("resultDrawer");

let originalData, imageSize;
let originalBuffer, storageBuffer, resultsBuffer, uniformsBuffer;
let horizontalBindGroup, verticalBindGroup, horizontalPipeline, verticalPipeline;

/* Listeners */
document.getElementById("userImage").addEventListener('change', function () {
  if (this.files && this.files[0]) {
    let reader = new FileReader();
    reader.onload = (e) => {
      image = document.getElementById('imageDisplay');
      image.setAttribute('src', e.target.result);
      setTimeout(updateCanvasAttributes, 500);
    }
    reader.readAsDataURL(this.files[0]);
    pointStack = [];
    document.getElementById("applyTiltshift").disabled = true;


  }
});

document.getElementById("lineDrawer").addEventListener('click', ev => {
  let x = ev.clientX;
  let y = ev.clientY;
  let pos = ev.target.getBoundingClientRect();
  image = document.getElementById("imageDisplay");

  //This is to know where clicked in original image
  x = ((x - pos.x | 1) / image.clientWidth) * image.naturalWidth;
  y = ((y - pos.y | 1) / image.clientHeight) * image.naturalHeight;

  addToPointStack([x | 1, y | 1]);
  if (pointStack.length == 2) {
    updateLine();
    document.getElementById("applyTiltshift").disabled = false;
  }
});

window.addEventListener('resize', updateCanvasAttributes);

/* FUNCTIONS */

function addToPointStack(point) {
  let pointStackSize = pointStack.length;

  if (pointStackSize == 0 || pointStackSize == 1) pointStack.push(point);
  else if (pointStackSize == 2) {
    pointStack[0] = pointStack[1];
    pointStack[1] = point;
  }

}

function updateCanvasAttributes() {
  image = document.getElementById("imageDisplay");

  lineDrawerCanvas.setAttribute('width', image.clientWidth);
  lineDrawerCanvas.setAttribute('height', image.clientHeight);
  resultDrawerCanvas.setAttribute('width', image.clientWidth);
  resultDrawerCanvas.setAttribute('height', image.clientHeight);

}

function updateLine() {
  image = document.getElementById("imageDisplay");
  const canvas = document.getElementById("lineDrawer");
  context2d = canvas.getContext("2d");

  //Calc line equation
  const x1 = pointStack[0][0] * image.clientWidth / image.naturalWidth;
  const y1 = pointStack[0][1] * image.clientHeight / image.naturalHeight;
  const x2 = pointStack[1][0] * image.clientWidth / image.naturalWidth;
  const y2 = pointStack[1][1] * image.clientHeight / image.naturalHeight;

  const m = (y2 - y1) / (x2 - x1);
  const b = y1 - (m * x1);

  const drawY1 = b;
  const drawY2 = m * canvas.width + b;

  //Draw line that crosses both points
  context2d.clearRect(0, 0, canvas.width, canvas.height);
  context2d.beginPath();
  context2d.moveTo(0, drawY1);
  context2d.lineTo(canvas.width, drawY2);
  context2d.lineWidth = 1;
  context2d.strokeStyle = "red";
  context2d.stroke();

  //Draw crosses on the points
  const CROSS_SIZE = 32;
  let img = new Image();
  img.onload = () => {
    context2d.drawImage(img, x1 - CROSS_SIZE / 2, y1 - CROSS_SIZE / 2, CROSS_SIZE, CROSS_SIZE);
    context2d.drawImage(img, x2 - CROSS_SIZE / 2, y2 - CROSS_SIZE / 2, CROSS_SIZE, CROSS_SIZE);
  }
  img.src = "cross.svg";

}

// MAIN

async function setup() {

  if (!navigator.gpu) {
    alert("WebGPU not supported on this browser.");
    throw new Error("WebGPU not supported on this browser.");
  }
  const adapter = await navigator.gpu?.requestAdapter();
  device = await adapter?.requestDevice();
  if (!device) {
    alert("Couldn't find a WebGPU device.");
    throw new Error("Couldn't find a WebGPU device.");
  }

}

async function computeBlur(radius) {
  const resultDrawerCanvas = document.getElementById("resultDrawer");
  const contextResult = resultDrawerCanvas.getContext("2d");
  contextResult.drawImage(image,0,0);

  originalData = contextResult.getImageData(0, 0, image.width, image.height);
  imageSize = originalData.data.length;

   // Buffer creation
   originalBuffer = device.createBuffer({
    size: imageSize,
    usage: GPUBufferUsage.STORAGE,
    mappedAtCreation: true,
  });
  const imageWriteArray = new Uint8ClampedArray(originalBuffer.getMappedRange());
  imageWriteArray.set(originalData.data);
  originalBuffer.unmap();

  storageBuffer = device.createBuffer({ size: imageSize, usage: GPUBufferUsage.STORAGE });
  resultsBuffer = device.createBuffer({ size: imageSize, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  outputBuffer = device.createBuffer({ size: imageSize, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  uniformsBuffer = device.createBuffer({ size: maxUniformsSize, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });

  // Bind buffers to kernel
  const bindGroupLayout = device.createBindGroupLayout({
      entries: [{
          binding: sourceBufferBindingNum,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "storage" },
      }, {
          binding: outputBufferBindingNum,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "storage" },
      }, {
          binding: uniformsBufferBindingNum,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "storage" },
      }]
  });

  horizontalBindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [{
          binding: sourceBufferBindingNum,
          resource: {
              buffer: originalBuffer,
              size: imageSize
          }
      }, {
          binding: outputBufferBindingNum,
          resource: {
              buffer: storageBuffer,
              size: imageSize
          }
      }, {
          binding: uniformsBufferBindingNum,
          resource: {
              buffer: uniformsBuffer,
              size: maxUniformsSize
          }
      }]
  });

  verticalBindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [{
          binding: sourceBufferBindingNum,
          resource: {
              buffer: storageBuffer,
              size: imageSize
          }
      }, {
          binding: outputBufferBindingNum,
          resource: {
              buffer: resultsBuffer,
              size: imageSize
          }
      }, {
          binding: uniformsBufferBindingNum,
          resource: {
              buffer: uniformsBuffer,
              size: maxUniformsSize
          }
      }]
  });

  // Set up pipelines
  const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] });

  const shaderModule = device.createShaderModule({ code: createShaderCode(image), isWHLSL: true });

  horizontalPipeline = device.createComputePipeline({
      layout: pipelineLayout,
      compute: {
          module: shaderModule,
          entryPoint: "horizontal"
      }
  });

  verticalPipeline = device.createComputePipeline({
      layout: pipelineLayout,
      compute: {
          module: shaderModule,
          entryPoint: "vertical"
      }
  });

  const uniforms = await setUniforms(radius);
  device.queue.writeBuffer(uniformsBuffer, 0, uniforms);

  // Run horizontal pass first
  const commandEncoder = device.createCommandEncoder();
  const passEncoder = commandEncoder.beginComputePass();
  passEncoder.setBindGroup(0, horizontalBindGroup);
  passEncoder.setPipeline(horizontalPipeline);
  const numXGroups = Math.ceil(image.width / threadsPerThreadgroup);
  passEncoder.dispatchWorkgroups(numXGroups, image.height, 1);
  passEncoder.end();

  // Run vertical pass
  const verticalPassEncoder = commandEncoder.beginComputePass();
  verticalPassEncoder.setBindGroup(0, verticalBindGroup);
  verticalPassEncoder.setPipeline(verticalPipeline);
  const numYGroups = Math.ceil(image.height / threadsPerThreadgroup);
  verticalPassEncoder.dispatchWorkgroups(image.width, numYGroups, 1);
  verticalPassEncoder.end();

  commandEncoder.copyBufferToBuffer(resultsBuffer, 0, outputBuffer, 0, imageSize);

  device.queue.submit([commandEncoder.finish()]);

  // Draw outputBuffer as imageData back into context2d
  await outputBuffer.mapAsync(GPUMapMode.READ);
  const resultArray = new Uint8ClampedArray(outputBuffer.getMappedRange());
  contextResult.putImageData(new ImageData(resultArray, image.width, image.height), 0, 0);
  outputBuffer.unmap();
}

/* Helpers */

let uniformsCache = new Map();

async function setUniforms(radius) {
  let uniforms = uniformsCache.get(radius);
  if (uniforms != undefined)
    return uniforms;

  const sigma = radius / 2.0;
  const twoSigma2 = 2.0 * sigma * sigma;

  uniforms = new Float32Array(34);
  uniforms[0] = radius;
  let weightSum = 0;

  for (let i = 0; i <= radius; ++i) {
    const weight = Math.exp(-i * i / twoSigma2);
    uniforms[i + 1] = weight;
    weightSum += (i == 0) ? weight : weight * 2;
  }

  // Compensate for loss in brightness
  const brightnessScale = 1 - (0.1 / 32.0) * radius;
  weightSum *= brightnessScale;
  for (let i = 1; i < uniforms.length; ++i)
    uniforms[i] /= weightSum;

  uniformsCache.set(radius, uniforms);

  return uniforms;
}

const byteMask = (1 << 8) - 1;

function createShaderCode(image) {
  return `
fn getR(rgba: u32) -> u32
{
    return rgba & ${byteMask};
}

fn getG(rgba: u32) -> u32
{
    return (rgba >> 8) & ${byteMask};
}

fn getB(rgba: u32) -> u32
{
    return (rgba >> 16) & ${byteMask};
}

fn getA(rgba: u32) -> u32
{
    return (rgba >> 24) & ${byteMask};
}

fn makeRGBA(r: u32, g: u32, b: u32, a: u32) -> u32
{
    return r + (g << 8) + (b << 16) + (a << 24);
}

var<private> channels : array<u32, 4>;
fn accumulateChannels(startColor: u32, weight: f32)
{
    channels[0] += u32(f32(getR(startColor)) * weight);
    channels[1] += u32(f32(getG(startColor)) * weight);
    channels[2] += u32(f32(getB(startColor)) * weight);
    channels[3] += u32(f32(getA(startColor)) * weight);

    // Compensate for brightness-adjusted weights.
    if (channels[0] > 255) {
        channels[0] = 255;
    }

    if (channels[1] > 255) {
        channels[1] = 255;
    }

    if (channels[2] > 255) {
        channels[2] = 255;
    }

    if (channels[3] > 255) {
        channels[3] = 255;
    }
}

fn horizontallyOffsetIndex(index: u32, offset: i32, rowStart: i32, rowEnd: i32) -> u32
{
    let offsetIndex = i32(index) + offset;

    if (offsetIndex < rowStart || offsetIndex >= rowEnd) {
        return index;
    }

    return u32(offsetIndex);
}

fn verticallyOffsetIndex(index: u32, offset: i32, length: u32) -> u32
{
    let realOffset = offset * ${image.width};
    let offsetIndex = i32(index) + realOffset;

    if (offsetIndex < 0 || offsetIndex >= i32(length)) {
        return index;
    }

    return u32(offsetIndex);
}

@group(0) @binding(${sourceBufferBindingNum}) var<storage, read_write> source : array<u32>;
@group(0) @binding(${outputBufferBindingNum}) var<storage, read_write> output : array<u32>;
@group(0) @binding(${uniformsBufferBindingNum}) var<storage, read_write> uniforms : array<f32>;

@workgroup_size(${threadsPerThreadgroup}, 1, 1)
@compute
fn horizontal(@builtin(global_invocation_id) dispatchThreadID: vec3<u32>)
{
    let radius = i32(uniforms[0]);
    let rowStart = ${image.width} * i32(dispatchThreadID.y);
    let rowEnd = ${image.width} * (1 + i32(dispatchThreadID.y));
    let globalIndex = u32(rowStart) + u32(dispatchThreadID.x);

    var i = -radius;
    loop {
        if i > radius { break; }

        let startColor = source[horizontallyOffsetIndex(globalIndex, i, rowStart, rowEnd)];
        let weight = uniforms[u32(abs(i) + 1)];
        accumulateChannels(startColor, weight);

        i++;
    }

    output[globalIndex] = makeRGBA(channels[0], channels[1], channels[2], channels[3]);
}

@workgroup_size(1, ${threadsPerThreadgroup}, 1)
@compute
fn vertical(@builtin(global_invocation_id) dispatchThreadID: vec3<u32>)
{
    let radius = i32(uniforms[0]);
    let globalIndex = u32(dispatchThreadID.x) * ${image.height} + u32(dispatchThreadID.y);

    var i = -radius;
    loop {
        if i > radius { break; }

        let startColor = source[verticallyOffsetIndex(globalIndex, i, arrayLength(&source))];
        let weight = uniforms[u32(abs(i) + 1)];
        accumulateChannels(startColor, weight);

        i++;
    }

    output[globalIndex] = makeRGBA(channels[0], channels[1], channels[2], channels[3]);
}
`;
}

window.onload = setup();