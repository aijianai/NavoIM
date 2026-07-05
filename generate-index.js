#!/usr/bin/env node

/**
 * Navo IM 项目索引生成器
 * 
 * 用法:
 *   node generate-index.js [选项]
 * 
 * 选项:
 *   --config <path>    指定配置文件路径 (默认: index-config.json)
 *   --output <path>    指定输出文件路径 (默认: INDEX.md)
 *   --watch           监听文件变化并自动更新索引
 *   --verbose         显示详细输出
 *   --help            显示帮助信息
 */

const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');

// 默认配置
const DEFAULT_CONFIG = {
  name: "navo-im-index",
  version: "1.0.0",
  indexFile: "INDEX.md",
  guideFile: "AI_INDEX_GUIDE.md",
  include: {
    fileTypes: [".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".css", ".html"],
    directories: ["shared/src", "server/src", "web/src", "web/public", "web"],
    rootFiles: ["package.json", ".env.example", ".gitignore", "test_sfu.py"]
  },
  exclude: {
    directories: ["node_modules", "dist", "produce", ".git", ".qwen", "server/data", "server/uploads"],
    fileTypes: [".webp", ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg"],
    files: ["package-lock.json", "*.tar.gz", "*.sqlite*", "*.tsbuildinfo", ".env", ".env.local"]
  },
  indexDetails: {
    fileInfo: { name: true, path: true, size: true, lastModified: true, type: true },
    codeStructure: { functions: true, classes: true, interfaces: true, types: true, exports: true, imports: true },
    contentSummary: { enabled: true, maxLines: 50, includeKeyFunctions: true, includeMainClasses: true }
  },
  format: { type: "markdown", encoding: "utf-8", lineEnding: "unix" }
};

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    config: 'index-config.json',
    output: 'INDEX.md',
    watch: false,
    verbose: false,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--config':
        options.config = args[++i];
        break;
      case '--output':
        options.output = args[++i];
        break;
      case '--watch':
        options.watch = true;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--help':
        options.help = true;
        break;
    }
  }

  return options;
}

// 显示帮助信息
function showHelp() {
  console.log(`
Navo IM 项目索引生成器

用法:
  node generate-index.js [选项]

选项:
  --config <path>    指定配置文件路径 (默认: index-config.json)
  --output <path>    指定输出文件路径 (默认: INDEX.md)
  --watch           监听文件变化并自动更新索引
  --verbose         显示详细输出
  --help            显示帮助信息

示例:
  node generate-index.js
  node generate-index.js --config my-config.json --output my-index.md
  node generate-index.js --watch --verbose
  `);
}

// 加载配置文件
function loadConfig(configPath) {
  try {
    if (fs.existsSync(configPath)) {
      const configData = fs.readFileSync(configPath, 'utf8');
      const userConfig = JSON.parse(configData);
      return { ...DEFAULT_CONFIG, ...userConfig };
    }
  } catch (error) {
    console.warn(`警告: 无法加载配置文件 ${configPath}, 使用默认配置`);
  }
  return DEFAULT_CONFIG;
}

// 检查文件是否应该被索引
function shouldIndexFile(filePath, config) {
  const ext = path.extname(filePath);
  const relativePath = path.relative(process.cwd(), filePath);
  
  // 检查文件类型
  if (config.exclude.fileTypes.includes(ext)) {
    return false;
  }
  
  // 检查排除的文件
  if (config.exclude.files.some(pattern => {
    if (pattern.startsWith('*')) {
      return relativePath.endsWith(pattern.slice(1));
    }
    return relativePath === pattern;
  })) {
    return false;
  }
  
  // 检查排除的目录（使用路径分隔符确保精确匹配）
  if (config.exclude.directories.some(dir => {
    // 检查路径是否以排除目录开头
    if (relativePath.startsWith(dir + '/') || relativePath === dir) {
      return true;
    }
    // 检查路径中是否包含排除目录（如 web/node_modules/xxx）
    if (relativePath.includes('/' + dir + '/') || relativePath.includes('/' + dir)) {
      return true;
    }
    return false;
  })) {
    return false;
  }
  
  // 检查包含的文件类型
  if (!config.include.fileTypes.includes(ext)) {
    return false;
  }
  
  return true;
}

// 检查目录是否应该被索引
function shouldIndexDir(dirPath, config) {
  const relativePath = path.relative(process.cwd(), dirPath);
  
  // 检查排除的目录（使用路径分隔符确保精确匹配）
  if (config.exclude.directories.some(dir => {
    // 检查路径是否以排除目录开头
    if (relativePath.startsWith(dir + '/') || relativePath === dir) {
      return true;
    }
    // 检查路径中是否包含排除目录（如 web/node_modules/xxx）
    if (relativePath.includes('/' + dir + '/') || relativePath.includes('/' + dir)) {
      return true;
    }
    return false;
  })) {
    return false;
  }
  
  return true;
}

// 收集文件信息
function collectFileInfo(filePath, config) {
  try {
    const stats = fs.statSync(filePath);
    const relativePath = path.relative(process.cwd(), filePath);
    const ext = path.extname(filePath);
    
    return {
      name: path.basename(filePath),
      path: relativePath,
      size: formatFileSize(stats.size),
      sizeBytes: stats.size,
      lastModified: stats.mtime.toISOString(),
      type: getFileType(ext),
      extension: ext
    };
  } catch (error) {
    return null;
  }
}

// 格式化文件大小
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// 获取文件类型
function getFileType(ext) {
  const typeMap = {
    '.ts': 'TypeScript',
    '.tsx': 'React TSX',
    '.js': 'JavaScript',
    '.jsx': 'React JSX',
    '.json': 'JSON',
    '.md': 'Markdown',
    '.css': 'CSS',
    '.html': 'HTML',
    '.py': 'Python',
    '.env.example': 'Env Example',
    '.gitignore': 'Git Ignore'
  };
  return typeMap[ext] || 'Unknown';
}

// 分析代码结构
function analyzeCodeStructure(filePath, config) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    const structure = {
      exports: [],
      imports: [],
      functions: [],
      classes: [],
      interfaces: [],
      types: []
    };
    
    // 只分析 TypeScript/JavaScript 文件
    const ext = path.extname(filePath);
    if (!['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
      return structure;
    }
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // 分析导出
      if (line.startsWith('export ')) {
        if (line.includes('function ')) {
          const match = line.match(/export\s+(?:async\s+)?function\s+(\w+)/);
          if (match) structure.exports.push(match[1]);
        } else if (line.includes('class ')) {
          const match = line.match(/export\s+(?:abstract\s+)?class\s+(\w+)/);
          if (match) structure.exports.push(match[1]);
        } else if (line.includes('interface ')) {
          const match = line.match(/export\s+interface\s+(\w+)/);
          if (match) structure.exports.push(match[1]);
        } else if (line.includes('type ')) {
          const match = line.match(/export\s+type\s+(\w+)/);
          if (match) structure.exports.push(match[1]);
        } else if (line.includes('const ') || line.includes('let ') || line.includes('var ')) {
          const match = line.match(/export\s+(?:const|let|var)\s+(\w+)/);
          if (match) structure.exports.push(match[1]);
        }
      }
      
      // 分析导入
      if (line.startsWith('import ')) {
        const match = line.match(/import\s+.*\s+from\s+['"](.+)['"]/);
        if (match) structure.imports.push(match[1]);
      }
      
      // 分析函数
      if (line.match(/^(?:export\s+)?(?:async\s+)?function\s+\w+/)) {
        const match = line.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
        if (match) structure.functions.push(match[1]);
      }
      
      // 分析类
      if (line.match(/^(?:export\s+)?(?:abstract\s+)?class\s+\w+/)) {
        const match = line.match(/(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/);
        if (match) structure.classes.push(match[1]);
      }
      
      // 分析接口
      if (line.match(/^(?:export\s+)?interface\s+\w+/)) {
        const match = line.match(/(?:export\s+)?interface\s+(\w+)/);
        if (match) structure.interfaces.push(match[1]);
      }
      
      // 分析类型
      if (line.match(/^(?:export\s+)?type\s+\w+/)) {
        const match = line.match(/(?:export\s+)?type\s+(\w+)/);
        if (match) structure.types.push(match[1]);
      }
    }
    
    return structure;
  } catch (error) {
    return {
      exports: [],
      imports: [],
      functions: [],
      classes: [],
      interfaces: [],
      types: []
    };
  }
}

// 生成目录树
function generateDirectoryTree(dirPath, config, prefix = '', isLast = true) {
  let tree = '';
  const items = [];
  
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      if (shouldIndexDir(path.join(dirPath, entry.name), config)) {
        items.push(entry);
      }
    }
    
    // 排序：目录在前，文件在后
    items.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });
    
    for (let i = 0; i < items.length; i++) {
      const entry = items[i];
      const isLastItem = i === items.length - 1;
      const connector = isLastItem ? '└── ' : '├── ';
      const newPrefix = prefix + (isLastItem ? '    ' : '│   ');
      
      if (entry.isDirectory()) {
        tree += `${prefix}${connector}${entry.name}/\n`;
        tree += generateDirectoryTree(path.join(dirPath, entry.name), config, newPrefix, isLastItem);
      } else {
        if (shouldIndexFile(path.join(dirPath, entry.name), config)) {
          tree += `${prefix}${connector}${entry.name}\n`;
        }
      }
    }
  } catch (error) {
    // 忽略读取错误
  }
  
  return tree;
}

// 生成索引内容
function generateIndexContent(files, config) {
  let content = `# Navo IM 项目索引

## 项目概述

**项目名称**: Navo IM (navo-im)
**版本**: 0.1.0
**描述**: 下一代 IM 聊天软件
**技术栈**: TypeScript, React 18, Vite, Tailwind CSS, Express, WebSocket, MySQL, Redis
**最后更新**: ${new Date().toLocaleDateString('zh-CN')}
**索引版本**: 1.0.0
**文件数量**: ${files.length} 个核心源码文件

## 目录结构

\`\`\`
www/study_tool/
`;

  // 生成目录树
  content += generateDirectoryTree(process.cwd(), config);
  
  content += `\`\`\`

## 核心文件索引

`;

  // 按目录分组文件
  const filesByDir = {};
  for (const file of files) {
    const dir = path.dirname(file.path);
    if (!filesByDir[dir]) {
      filesByDir[dir] = [];
    }
    filesByDir[dir].push(file);
  }

  // 生成文件索引
  for (const [dir, dirFiles] of Object.entries(filesByDir)) {
    const dirName = dir || '.';
    content += `### ${dirName}\n\n`;
    content += `| 文件 | 大小 | 类型 | 最后修改 |\n`;
    content += `|------|------|------|----------|\n`;
    
    for (const file of dirFiles.sort((a, b) => a.name.localeCompare(b.name))) {
      content += `| ${file.name} | ${file.size} | ${file.type} | ${new Date(file.lastModified).toLocaleDateString('zh-CN')} |\n`;
    }
    
    content += '\n';
  }

  // 生成代码结构摘要
  content += `## 代码结构摘要

`;

  for (const file of files) {
    if (['.ts', '.tsx', '.js', '.jsx'].includes(file.extension)) {
      const structure = analyzeCodeStructure(file.path, config);
      
      if (structure.exports.length > 0 || structure.functions.length > 0 || 
          structure.classes.length > 0 || structure.interfaces.length > 0) {
        content += `### ${file.name}\n\n`;
        
        if (structure.exports.length > 0) {
          content += `**导出**: ${structure.exports.join(', ')}\n\n`;
        }
        
        if (structure.functions.length > 0) {
          content += `**函数**: ${structure.functions.join(', ')}\n\n`;
        }
        
        if (structure.classes.length > 0) {
          content += `**类**: ${structure.classes.join(', ')}\n\n`;
        }
        
        if (structure.interfaces.length > 0) {
          content += `**接口**: ${structure.interfaces.join(', ')}\n\n`;
        }
        
        if (structure.types.length > 0) {
          content += `**类型**: ${structure.types.join(', ')}\n\n`;
        }
      }
    }
  }

  // 添加配置文件信息
  content += `## 配置文件

| 文件 | 用途 |
|------|------|
| package.json | 根 package.json (monorepo) |
| server/package.json | 服务端依赖 |
| web/package.json | 前端依赖 |
| shared/package.json | 共享模块依赖 |
| server/tsconfig.json | 服务端 TS 配置 |
| web/tsconfig.json | 前端 TS 配置 |
| shared/tsconfig.json | 共享模块 TS 配置 |
| web/vite.config.ts | Vite 构建配置 |
| web/tailwind.config.js | TailwindCSS 配置 |
| .env.example | 环境变量模板 |

## 更新日志

**最后更新**: ${new Date().toLocaleDateString('zh-CN')}
**索引版本**: 1.0.0
**文件数量**: ${files.length} 个核心源码文件
`;

  return content;
}

// 主函数
async function main() {
  const options = parseArgs();
  
  if (options.help) {
    showHelp();
    process.exit(0);
  }
  
  console.log('Navo IM 项目索引生成器');
  console.log('====================\n');
  
  // 加载配置
  const config = loadConfig(options.config);
  console.log(`配置文件: ${options.config}`);
  console.log(`输出文件: ${options.output}`);
  
  // 收集文件
  console.log('\n收集文件信息...');
  const files = [];
  
  // 收集根目录文件
  for (const file of config.include.rootFiles) {
    const filePath = path.join(process.cwd(), file);
    if (fs.existsSync(filePath)) {
      const fileInfo = collectFileInfo(filePath, config);
      if (fileInfo) {
        files.push(fileInfo);
        if (options.verbose) {
          console.log(`  + ${fileInfo.path}`);
        }
      }
    }
  }
  
  // 递归收集目录中的文件
  function collectFilesFromDir(dirPath) {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          if (shouldIndexDir(fullPath, config)) {
            collectFilesFromDir(fullPath);
          }
        } else {
          if (shouldIndexFile(fullPath, config)) {
            const fileInfo = collectFileInfo(fullPath, config);
            if (fileInfo) {
              files.push(fileInfo);
              if (options.verbose) {
                console.log(`  + ${fileInfo.path}`);
              }
            }
          }
        }
      }
    } catch (error) {
      // 忽略读取错误
    }
  }
  
  // 从配置的目录收集文件
  for (const dir of config.include.directories) {
    const dirPath = path.join(process.cwd(), dir);
    if (fs.existsSync(dirPath)) {
      collectFilesFromDir(dirPath);
    }
  }
  
  console.log(`\n找到 ${files.length} 个文件`);
  
  // 生成索引内容
  console.log('生成索引内容...');
  const indexContent = generateIndexContent(files, config);
  
  // 写入索引文件
  console.log(`写入索引文件: ${options.output}`);
  fs.writeFileSync(options.output, indexContent, 'utf8');
  
  console.log('\n索引生成完成!');
  console.log(`\n使用方法:`);
  console.log(`  1. 查看索引文件: cat ${options.output}`);
  console.log(`  2. 更新索引: node generate-index.js`);
  console.log(`  3. 监听变化: node generate-index.js --watch`);
}

// 监听模式
function startWatchMode(configPath, outputPath, config, options) {
  console.log('\n启动监听模式...');
  
  const watchPaths = config.include.directories.map(dir => path.join(process.cwd(), dir));
  watchPaths.push(path.join(process.cwd(), config.guideFile));
  
  const watcher = chokidar.watch(watchPaths, {
    ignored: config.exclude.directories.map(dir => new RegExp(`${dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)),
    persistent: true,
    ignoreInitial: true
  });
  
  let debounceTimer = null;
  
  function regenerateIndex() {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    
    debounceTimer = setTimeout(() => {
      console.log('\n检测到文件变化，重新生成索引...');
      main().catch(console.error);
    }, 2000);
  }
  
  watcher
    .on('add', regenerateIndex)
    .on('change', regenerateIndex)
    .on('unlink', regenerateIndex);
  
  console.log('监听中... (按 Ctrl+C 退出)');
}

// 导出模块
module.exports = {
  loadConfig,
  shouldIndexFile,
  shouldIndexDir,
  collectFileInfo,
  analyzeCodeStructure,
  generateIndexContent
};

// 如果直接运行脚本
if (require.main === module) {
  const options = parseArgs();
  
  if (options.watch) {
    const config = loadConfig(options.config);
    startWatchMode(options.config, options.output, config, options);
  } else {
    main().catch(console.error);
  }
}