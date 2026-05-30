import esbuild from 'esbuild';

async function build() {
  console.log('Compiling background and content scripts with esbuild...');
  try {
    await esbuild.build({
      entryPoints: {
        background: 'src/extension/background.ts',
        'content-chatgpt': 'src/extension/content-chatgpt.ts',
        'content-claude': 'src/extension/content-claude.ts',
          'content-capture': 'src/extension/content-capture.ts', 
      },
      bundle: true,
      outdir: 'dist',
      platform: 'browser',
      target: 'chrome91',
      minify: false, // Keep readable for development audit, can be toggled to true
      sourcemap: false,
      logLevel: 'info',
    });
    console.log('Extension scripts compiled successfully.');
  } catch (error) {
    console.error('Failed to compile extension scripts:', error);
    process.exit(1);
  }
}

build();
