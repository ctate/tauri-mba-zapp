import { generate } from '@zappjs/core';
import { GitignoreGenerator } from '@zappjs/git';
import { HandlebarsEngine } from '@zappjs/handlebars';
import { JsonEngine } from '@zappjs/json';
import { LicenseGenerator } from '@zappjs/license';
import { PrettierProcessor } from '@zappjs/prettier';
import { camelCase, pascalCase, titleCase } from 'change-case';
import { plural } from 'pluralize';
import sharp from 'sharp';

import { ReadmeTemplate } from './templates/ReadmeTemplate';
import { TomlEngine } from '@zappjs/toml';
import { PrettierRustProcessor } from '@zappjs/prettier-rust';
import { mkdir, readFile } from 'fs/promises';
import { join, normalize } from 'path';
import { existsSync } from 'fs';

export interface ISpec {
  name: string;
  title?: string;
  version: string;
  license: 'Apache-2.0' | 'GPL-2.0-only' | 'GPL-3.0-only' | 'ISC' | 'MIT';
  repository: string;
  description: string;
  author?: {
    name?: string;
    email?: string;
    url?: string;
  };
  app: {
    icon: string;
    url: string;
    width?: number;
    height?: number;
  };
}

export default async function zapp(spec: ISpec) {
  const pkg = process?.versions?.node ? require(`${process.cwd()}/package.json`) : {};

  const icon = await readFile(join('.zapp', spec.app.icon));

  const sizes = {
    '32x32.png': [32, 32],
    '128x128.png': [128, 128],
    '128x128@2x.png': [256, 256],
    'icon.png': [128, 128],
  };

  if (!existsSync('src-tauri/icons')) {
    await mkdir('src-tauri/icons', { recursive: true });
  }
  await Promise.all(
    Object.entries(sizes).map(async ([sizeFile, size]) => {
      await sharp(icon)
        .resize(size[0], size[1])
        .toFile(normalize(`src-tauri/icons/${sizeFile}`));
    }),
  );

  return {
    '.vscode/extensions.json': await generate({
      engine: JsonEngine,
      spec: {
        recommendations: ['rust-lang.rust-analyzer', 'tauri-apps.tauri-vscode'],
      },
    }),
    'src-tauri/src/main.rs': await generate({
      processor: PrettierRustProcessor(),
      engine: () => `
        #![cfg_attr(all(not(debug_assertions), target_os = "windows"), windows_subsystem = "windows")]

        use tauri::{ CustomMenuItem, Manager, SystemTray, SystemTrayEvent, SystemTrayMenu };
        use tauri_plugin_positioner::{ Position, WindowExt };
        
        fn main() {
            let quit = CustomMenuItem::new("quit".to_string(), "Quit").accelerator("Cmd+Q");
            let system_tray_menu = SystemTrayMenu::new().add_item(quit);
            tauri::Builder
                ::default()
                .plugin(tauri_plugin_positioner::init())
                .system_tray(SystemTray::new().with_menu(system_tray_menu))
                .on_system_tray_event(|app, event| {
                    tauri_plugin_positioner::on_tray_event(app, &event);
                    match event {
                        SystemTrayEvent::LeftClick { position: _, size: _, .. } => {
                            let window = app.get_window("main").unwrap();
                            let _ = window.move_window(Position::TrayCenter);
        
                            if window.is_visible().unwrap() {
                                window.hide().unwrap();
                            } else {
                                window.show().unwrap();
                                window.set_focus().unwrap();
                            }
                        }
                        SystemTrayEvent::RightClick { position: _, size: _, .. } => {
                            println!("system tray received a right click");
                        }
                        SystemTrayEvent::DoubleClick { position: _, size: _, .. } => {
                            println!("system tray received a double click");
                        }
                        SystemTrayEvent::MenuItemClick { id, .. } =>
                            match id.as_str() {
                                "quit" => {
                                    std::process::exit(0);
                                }
                                "hide" => {
                                    let window = app.get_window("main").unwrap();
                                    window.hide().unwrap();
                                }
                                _ => {}
                            }
                        _ => {}
                    }
                })
                .on_window_event(|event| {
                    match event.event() {
                        tauri::WindowEvent::Focused(is_focused) => {
                            // detect click outside of the focused window and hide the app
                            if !is_focused {
                                event.window().hide().unwrap();
                            }
                        }
                        _ => {}
                    }
                })
                .run(tauri::generate_context!())
                .expect("error while running tauri application");
        }
      `,
    }),
    'src-tauri/Cargo.toml': await generate({
      engine: TomlEngine,
      spec: {
        package: {
          authors: spec.author?.name ? [spec.author?.name] : undefined,
          description: spec.description,
          edition: '2021',
          license: spec.license,
          name: spec.name,
          repository: spec.repository,
          'rust-version': '1.57',
          version: spec.version,
        },
        'build-dependencies': {
          'tauri-build': {
            features: [],
            version: '1.2',
          },
        },
        dependencies: {
          serde_json: '1.0',
          serde: {
            features: ['derive'],
            version: '1.0',
          },
          tauri: {
            features: ['macos-private-api', 'shell-open', 'system-tray'],
            version: '1.2',
          },
          'tauri-plugin-positioner': {
            features: ['system-tray'],
            version: '1.0.4',
          },
        },
        features: {
          'custom-protocol': ['tauri/custom-protocol'],
          default: ['custom-protocol'],
        },
      },
    }),
    'src-tauri/build.rs': await generate({
      processor: PrettierRustProcessor(),
      engine: () => `
        fn main() {
          tauri_build::build()
        }
      `,
    }),
    'src-tauri/tauri.conf.json': await generate({
      engine: JsonEngine,
      spec: {
        build: {
          devPath: spec.app.url,
          distDir: '../dist',
          withGlobalTauri: false,
        },
        package: {
          productName: spec.title || spec.name,
          version: '0.0.0',
        },
        tauri: {
          allowlist: {
            all: false,
            shell: {
              all: false,
              open: true,
            },
          },
          bundle: {
            active: true,
            category: 'DeveloperTool',
            copyright: '',
            deb: {
              depends: [],
            },
            externalBin: [],
            icon: [
              'icons/32x32.png',
              'icons/128x128.png',
              'icons/128x128@2x.png',
              'icons/icon.icns',
              'icons/icon.ico',
            ],
            identifier: 'dev.ctate.chatgpt-mba',
            longDescription: '',
            macOS: {
              entitlements: null,
              exceptionDomain: '',
              frameworks: [],
              providerShortName: null,
              signingIdentity: null,
            },
            resources: [],
            shortDescription: '',
            targets: 'all',
            windows: {
              certificateThumbprint: null,
              digestAlgorithm: 'sha256',
              timestampUrl: '',
            },
          },
          security: {
            csp: null,
          },
          updater: {
            active: false,
          },
          macOSPrivateApi: true,
          windows: [
            {
              fullscreen: false,
              height: spec.app.height || 800,
              resizable: false,
              title: 'menubar',
              width: spec.app.width || 600,
              visible: false,
              hiddenTitle: true,
              decorations: false,
              focus: false,
              transparent: true,
              skipTaskbar: true,
              alwaysOnTop: true,
            },
          ],
          systemTray: {
            iconPath: 'icons/icon.png',
            iconAsTemplate: true,
            menuOnLeftClick: false,
          },
        },
      },
    }),
    '.gitignore': await GitignoreGenerator([
      '# Logs',
      'logs',
      '*.log',
      'npm-debug.log*',
      'yarn-debug.log*',
      'yarn-error.log*',
      'pnpm-debug.log*',
      'lerna-debug.log*',
      '',
      'node_modules',
      'dist',
      'dist-ssr',
      '*.local',
      '',
      '# Editor directories and files',
      '.vscode/*',
      '!.vscode/extensions.json',
      '.idea',
      '.DS_Store',
      '*.suo',
      '*.ntvs*',
      '*.njsproj',
      '*.sln',
      '*.sw?',
    ]),
    LICENSE: await LicenseGenerator(spec),
    'package.json': await generate({
      engine: JsonEngine,
      spec: {
        ...pkg,
        name: spec.name,
        version: spec.version,
        description: spec.description,
        license: spec.license,
        author: spec.author
          ? {
              name: spec.author.name,
              email: spec.author.email,
              url: spec.author.url,
            }
          : undefined,
        scripts: {
          ...pkg.scripts,
          tauri: 'tauri dev',
        },
        dependencies: {
          ...pkg.dependencies,
          '@tauri-apps/api': '^1.2.0',
        },
        devDependencies: {
          ...pkg.devDependencies,
          '@tauri-apps/cli': '^1.2.2',
          '@types/node': '^18.7.10',
          typescript: '^4.6.4',
        },
      },
    }),
    'README.md': await generate({
      processor: PrettierProcessor({
        parser: 'markdown',
      }),
      engine: HandlebarsEngine,
      spec,
      template: ReadmeTemplate,
    }),
  };
}
