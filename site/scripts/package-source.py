from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
root = Path(__file__).resolve().parent.parent
excluded_dirs = {'.vercel', '.git', 'node_modules', '.sites-runtime', '.agents', '.codex', '.wrangler', '.next', '.vinext', 'dist', 'outputs', 'work', '__pycache__'}
excluded_names = {'source.zip', 'tsconfig.tsbuildinfo', 'next-env.d.ts'}
with ZipFile(root / 'public/source.zip', 'w', compression=ZIP_DEFLATED, compresslevel=6) as archive:
    for path in sorted(root.rglob('*')):
        if not path.is_file(): continue
        relative = path.relative_to(root)
        if any(part in excluded_dirs for part in relative.parts): continue
        if path.name in excluded_names: continue
        if path.name.startswith(('.dev.vars', '.env')) and path.name != '.env.example': continue
        if path.suffix in {'.pem','.key','.tar','.gz'}: continue
        if any(marker in path.name for marker in ('.db', '.sqlite')): continue
        # Unmodified npm runtime assets are obtained from the pinned package.
        if str(relative).startswith('public/vendor/'): continue
        archive.write(path, 'raqzilo/' + str(relative))
print('Corresponding source archive ready.')
