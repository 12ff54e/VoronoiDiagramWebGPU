// browser function check

if (!navigator.gpu) {
  throw new Error("WebGPU not supported on this browser.");
}
const adapter = await navigator.gpu.requestAdapter();
if (!adapter) {
  throw new Error("No appropriate GPUAdapter found.");
}
const device = await adapter.requestDevice();

// prepare canvas

const canvas = document.querySelector("canvas")!;
const WIDTH = 1920;
const HEIGHT = 1080;
canvas.width = WIDTH;
canvas.height = HEIGHT;

const ctx = canvas?.getContext("webgpu");
if (!ctx) {
  throw new Error("Can not get webgpu context of canvas.");
}
const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
ctx.configure({
  device: device,
  format: canvasFormat,
});

// x, y, r, g, b
const vertices = new Float32Array([
  // top left, orange
  -1, 1, 0.9, 0.7, 0.4,
  // top right, purple
  1, 1, 0.8, 0.7, 1,
  // bottom left, green
  -1, -1, 0.5, 1, 0.2,
  // bottom right, orange
  1, -1, 0.9, 0.7, 0.4,
]);
const vertexBuffer = device.createBuffer({
  size: vertices.byteLength,
  usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(vertexBuffer, 0, vertices);

const vertexBufferLayout: GPUVertexBufferLayout = {
  arrayStride: 20,
  attributes: [
    {
      format: "float32x2",
      offset: 0,
      shaderLocation: 0, // Position, see vertex shader
    },
    {
      format: "float32x3",
      offset: 8,
      shaderLocation: 1,
    },
  ],
};

const bindGroupLayout = device.createBindGroupLayout({
  entries: [
    {
      binding: 0,
      visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
      buffer: {},
    },
    {
      binding: 1,
      visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
      buffer: { type: "storage" },
    },
  ],
});
const pipelineLayout = device.createPipelineLayout({
  bindGroupLayouts: [bindGroupLayout],
});

const compiledShaders = await compileShader(device, "./shader/Voronoi.wgsl");
const computePipeline = device.createComputePipeline({
  layout: pipelineLayout,
  compute: {
    module: compiledShaders,
    entryPoint: "compute_main",
  },
});
const renderPipeline = device.createRenderPipeline({
  layout: pipelineLayout,
  vertex: {
    module: compiledShaders,
    entryPoint: "vertex_main",
    buffers: [vertexBufferLayout],
  },
  fragment: {
    module: compiledShaders,
    entryPoint: "fragment_main",
    targets: [
      {
        format: canvasFormat,
      },
    ],
  },
  primitive: {
    topology: "triangle-strip",
  },
});

const MAX_SITE_NUM = 4096;

// uniform buffer

const hostDataUniformBuffer = device.createBuffer({
  size: 16,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
const canvasDim = new Float32Array([WIDTH, HEIGHT]);
device.queue.writeBuffer(hostDataUniformBuffer, 8, canvasDim);

// storage buffer

const storageBuffer = device.createBuffer({
  size: MAX_SITE_NUM * 32, // Never forget the alignment
  usage: GPUBufferUsage.STORAGE, // The storage buffer is written in compute shader
});

// bind group

const bindGroup = device.createBindGroup({
  layout: bindGroupLayout,
  entries: [
    { binding: 0, resource: { buffer: hostDataUniformBuffer } },
    { binding: 1, resource: { buffer: storageBuffer } },
  ],
});

function draw(site_num: number) {
  // update uniform buffer
  device.queue.writeBuffer(
    hostDataUniformBuffer,
    0,
    new Uint32Array([site_num, Date.now()])
  );
  // record commands
  const encoder = device.createCommandEncoder();
  const computePass = encoder.beginComputePass();
  computePass.setBindGroup(0, bindGroup);
  computePass.setPipeline(computePipeline);
  computePass.dispatchWorkgroups(Math.ceil(site_num / 64));
  computePass.end();

  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: ctx!.getCurrentTexture().createView(),
        loadOp: "clear",
        clearValue: { r: 0.3, g: 0.3, b: 0.4, a: 1 },
        storeOp: "store",
      },
    ],
  });
  pass.setVertexBuffer(0, vertexBuffer);
  pass.setBindGroup(0, bindGroup);
  pass.setPipeline(renderPipeline);
  pass.draw(vertices.length / 5);
  pass.end();

  // the recorded commands are stored into commandBuffer
  // then submitted to device
  device.queue.submit([encoder.finish()]);
}

async function compileShader(device: GPUDevice, ...shaders_src_url: string[]) {
  return device.createShaderModule({
    code: (
      await Promise.all(
        (
          await Promise.all(shaders_src_url.map((url) => fetch(url)))
        ).map((res) => res.text())
      )
    ).join("\n"),
  });
}

let site_num = 1024;
document.body.addEventListener("keypress", (e) => {
  e.preventDefault();
  if (e.key == "f") {
    draw(site_num);
  }
});

draw(site_num);

// ensure this file is treated as a module by linter
export {};
