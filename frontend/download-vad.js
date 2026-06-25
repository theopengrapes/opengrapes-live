const fs = require('fs');
const path = require('path');

const destDir = path.join(__dirname, 'public', 'vad');

if (!fs.existsSync(destDir)) {
	fs.mkdirSync(destDir, { recursive: true });
}

// We use 1.19.2 because it is a stable modern version of onnxruntime-web that includes the .mjs files.
const onnxVersion = '1.22.0';
const files = [
	// VAD model, script, and worklet
	{
		url: 'https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.30/dist/silero_vad_legacy.onnx',
		name: 'silero_vad_legacy.onnx',
		required: true
	},
	{
		url: 'https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.30/dist/vad.worklet.bundle.min.js',
		name: 'vad.worklet.bundle.min.js',
		required: true
	},
	{
		url: 'https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.30/dist/bundle.min.js',
		name: 'bundle.min.js',
		required: true
	},
	// ONNX WASM main script and binaries
	{
		url: `https://unpkg.com/onnxruntime-web@${onnxVersion}/dist/ort.js`,
		name: 'ort.js',
		required: true
	},
	// ONNX WASM binaries and glue code
	{
		url: `https://unpkg.com/onnxruntime-web@${onnxVersion}/dist/ort-wasm-simd-threaded.wasm`,
		name: 'ort-wasm-simd-threaded.wasm',
		required: true
	},
	{
		url: `https://unpkg.com/onnxruntime-web@${onnxVersion}/dist/ort-wasm-simd-threaded.mjs`,
		name: 'ort-wasm-simd-threaded.mjs',
		required: true
	},
	// Optional WebGPU versions
	{
		url: `https://unpkg.com/onnxruntime-web@${onnxVersion}/dist/ort-wasm-simd-threaded.jsep.wasm`,
		name: 'ort-wasm-simd-threaded.jsep.wasm',
		required: false
	},
	{
		url: `https://unpkg.com/onnxruntime-web@${onnxVersion}/dist/ort-wasm-simd-threaded.jsep.mjs`,
		name: 'ort-wasm-simd-threaded.jsep.mjs',
		required: false
	}
];

async function downloadFile(file) {
	const destPath = path.join(destDir, file.name);
	console.log(`Downloading ${file.url} -> ${destPath}`);
	
	try {
		const response = await fetch(file.url);
		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}
		const buffer = await response.arrayBuffer();
		fs.writeFileSync(destPath, Buffer.from(buffer));
		console.log(`Successfully downloaded ${file.name}`);
	} catch (error) {
		if (file.required) {
			console.error(`Failed to download required file ${file.name}:`, error);
			process.exit(1);
		} else {
			console.warn(`Failed to download optional file ${file.name} (skipping):`, error.message);
		}
	}
}

async function main() {
	for (const file of files) {
		await downloadFile(file);
	}
	console.log('All files downloaded successfully!');
}

main();
