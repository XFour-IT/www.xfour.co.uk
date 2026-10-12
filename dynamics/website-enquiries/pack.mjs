// Builds the importable Power Platform solution from ./src.
//
//   node dynamics/website-enquiries/pack.mjs
//
// Writes dist/XFourWebsiteEnquiries_<version>.zip. Import it at
// make.powerapps.com → Solutions → Import solution. See docs/lead-forms.md.
//
// Before zipping it checks that the parts agree with each other and with the
// Worker, because a mismatch here does not fail the import — it gives a flow
// that imports cleanly and then never fires.
import { readFileSync, readdirSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync, crc32 } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, 'src');
const wranglerPath = join(here, '..', '..', 'x4-website', 'wrangler.jsonc');

const fail = (message) => {
	console.error(`pack: ${message}`);
	process.exit(1);
};

function filesUnder(dir) {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		return statSync(path).isDirectory() ? filesUnder(path) : [path];
	});
}

// ---- consistency checks ----------------------------------------------------

const solutionXml = readFileSync(join(src, 'solution.xml'), 'utf8');
const customizationsXml = readFileSync(join(src, 'customizations.xml'), 'utf8');

const version = solutionXml.match(/<Version>([\d.]+)<\/Version>/)?.[1];
if (!version) fail('no <Version> in solution.xml');

const rootIds = [...solutionXml.matchAll(/<RootComponent type="29" id="\{([0-9a-f-]+)\}"/gi)].map((m) => m[1].toLowerCase());
const workflows = [...customizationsXml.matchAll(/<Workflow WorkflowId="\{([0-9a-f-]+)\}"[\s\S]*?<JsonFileName>([^<]+)<\/JsonFileName>/gi)].map((m) => ({
	id: m[1].toLowerCase(),
	jsonFileName: m[2],
}));
if (workflows.length === 0) fail('no <Workflow> in customizations.xml');

const connectionReferences = new Set(
	[...customizationsXml.matchAll(/connectionreferencelogicalname="([^"]+)"/g)].map((m) => m[1]),
);

const wrangler = readFileSync(wranglerPath, 'utf8');
const leadSources = ['LEAD_SOURCE_DYNAMICS', 'LEAD_SOURCE_MANAGED_IT'].map((name) => {
	const value = wrangler.match(new RegExp(`"${name}":\\s*"(\\d+)"`))?.[1];
	if (!value) fail(`${name} is not set in x4-website/wrangler.jsonc`);
	return value;
});

for (const workflow of workflows) {
	if (!rootIds.includes(workflow.id)) fail(`workflow ${workflow.id} is not a root component in solution.xml`);
	if (!workflow.jsonFileName.toLowerCase().includes(workflow.id)) {
		fail(`${workflow.jsonFileName} does not carry workflow id ${workflow.id}`);
	}

	let flow;
	try {
		flow = JSON.parse(readFileSync(join(src, workflow.jsonFileName), 'utf8'));
	} catch (error) {
		fail(`${workflow.jsonFileName}: ${error.message}`);
	}

	for (const [name, reference] of Object.entries(flow.properties.connectionReferences)) {
		const logicalName = reference.connection?.connectionReferenceLogicalName;
		if (!connectionReferences.has(logicalName)) {
			fail(`${name} points at connection reference ${logicalName}, which customizations.xml does not define`);
		}
	}

	const { actions, triggers } = flow.properties.definition;
	const usedConnections = new Set(
		[...Object.values(triggers), ...Object.values(actions)].map((step) => step.inputs?.host?.connectionName).filter(Boolean),
	);
	for (const name of usedConnections) {
		if (!flow.properties.connectionReferences[name]) fail(`a step uses connection ${name}, which the flow does not declare`);
	}
	for (const [name, action] of Object.entries(actions)) {
		for (const before of Object.keys(action.runAfter ?? {})) {
			if (!actions[before]) fail(`${name} runs after ${before}, which does not exist`);
		}
	}

	// Power Automate rejects a step description over 256 characters, but only
	// when the flow is turned on — the import itself still reports success.
	for (const [name, step] of Object.entries({ ...triggers, ...actions })) {
		const length = step.description?.length ?? 0;
		if (length > 256) fail(`the description of ${name} is ${length} characters; the limit is 256`);
	}

	// The trigger filter must name exactly the Lead Source values the Worker
	// writes, or the flow never fires for a web enquiry.
	for (const trigger of Object.values(triggers)) {
		const filter = trigger.inputs?.parameters?.['subscriptionRequest/filterexpression'];
		if (filter === undefined) continue;
		const inFilter = [...filter.matchAll(/leadsourcecode eq (\d+)/g)].map((m) => m[1]).sort();
		if (inFilter.join() !== [...leadSources].sort().join()) {
			fail(`trigger filter has Lead Source ${inFilter.join(', ')} but wrangler.jsonc has ${leadSources.join(', ')}`);
		}
	}
}

// ---- zip -------------------------------------------------------------------

const entries = filesUnder(src).map((path) => ({
	name: relative(src, path).split('\\').join('/'),
	data: readFileSync(path),
}));

const chunks = [];
const central = [];
let offset = 0;
for (const { name, data } of entries) {
	const nameBytes = Buffer.from(name, 'utf8');
	const compressed = deflateRawSync(data);
	const crc = crc32(data);

	const local = Buffer.alloc(30);
	local.writeUInt32LE(0x04034b50, 0);
	local.writeUInt16LE(20, 4); // version needed
	local.writeUInt16LE(0x0800, 6); // UTF-8 names
	local.writeUInt16LE(8, 8); // deflate
	local.writeUInt32LE(0, 10); // time/date: 1980-01-01, so the zip is reproducible
	local.writeUInt32LE(crc, 14);
	local.writeUInt32LE(compressed.length, 18);
	local.writeUInt32LE(data.length, 22);
	local.writeUInt16LE(nameBytes.length, 26);
	local.writeUInt16LE(0, 28);

	const header = Buffer.alloc(46);
	header.writeUInt32LE(0x02014b50, 0);
	header.writeUInt16LE(20, 4);
	header.writeUInt16LE(20, 6);
	header.writeUInt16LE(0x0800, 8);
	header.writeUInt16LE(8, 10);
	header.writeUInt32LE(0, 12);
	header.writeUInt32LE(crc, 16);
	header.writeUInt32LE(compressed.length, 20);
	header.writeUInt32LE(data.length, 24);
	header.writeUInt16LE(nameBytes.length, 28);
	header.writeUInt32LE(offset, 42);

	chunks.push(local, nameBytes, compressed);
	central.push(header, nameBytes);
	offset += local.length + nameBytes.length + compressed.length;
}

const centralSize = central.reduce((sum, b) => sum + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(entries.length, 8);
end.writeUInt16LE(entries.length, 10);
end.writeUInt32LE(centralSize, 12);
end.writeUInt32LE(offset, 16);

const outDir = join(here, 'dist');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, `XFourWebsiteEnquiries_${version.replaceAll('.', '_')}.zip`);
writeFileSync(outPath, Buffer.concat([...chunks, ...central, end]));
console.log(`pack: ${entries.length} files → ${relative(process.cwd(), outPath)}`);
