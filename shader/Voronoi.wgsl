struct Site {
    pos: vec2<f32>,
    color: vec3<f32>,
}

struct HostData {
    site_num: u32,
    time_stamp: u32,
    canvas_dim: vec2<f32>,
}

@group(0) @binding(0) var<uniform> host_data: HostData;
@group(0) @binding(1) var<storage, read_write> sites: array<Site>;

fn rand(r: f32) -> f32 {
    return fract(sin(123.456 * r) * 7634.95 + 1962.35);
}

@compute @workgroup_size(64)
fn compute_main(@builtin(global_invocation_id) id: vec3<u32>) {
    if(id.x >= host_data.site_num) { return; 
    }
    let site = & sites[id.x];
    let ar = host_data.canvas_dim.x / host_data.canvas_dim.y;
    let seed = rand(f32(host_data.time_stamp % 100000u)) * f32(id.x);

    var r = rand(seed);
    (*site).pos.x = ar * (r - .5);
    r = rand(r);
    (*site).pos.y = r - .5;
    r = rand(r);
    (*site).color.x = r;
    r = rand(r);
    (*site).color.y = r;
    r = rand(r);
    (*site).color.z = r;
}

struct VertexOutput {
    @builtin(position) pos: vec4<f32>,
    @location(0) color: vec3<f32>,
}

@vertex
fn vertex_main(
    @location(0) pos: vec2<f32>,
    @location(1) color: vec3<f32>
) -> VertexOutput {
    var output: VertexOutput;
    output.pos = vec4<f32>(pos, 0., 1.);
    output.color = color;
    return output;
}

@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4<f32> {
    let POINT_SIZE = 0.02f / sqrt(f32(host_data.site_num));
    const AA_WIDTH = 0.004f;

    var uv = input.pos.xy / host_data.canvas_dim - vec2(.5);
    uv.x *= host_data.canvas_dim.x / host_data.canvas_dim.y;

    var nearest_site_index = 0u;
    var shortest_dist = 10.;
    for (var i = 0u; i < host_data.site_num; i++) {
        var dist = distance(uv, sites[i].pos);

        // Draw the site
        if (dist < POINT_SIZE + AA_WIDTH) {
            var color = mix(vec3<f32>(0.), sites[i].color, smoothstep(POINT_SIZE, POINT_SIZE + AA_WIDTH, dist));
            return vec4<f32>(color, 1.);
        }
        if (dist < shortest_dist) {
            shortest_dist = dist;
            nearest_site_index = i;
        }
    }

    return vec4<f32>(sites[nearest_site_index].color, 1.);
}
