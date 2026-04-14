/**
 * 将克隆地址转为可浏览的 Web 根路径（无 .git 后缀）
 */
export function normalizeGitWebRoot(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const ssh = /^git@([^:]+):(.+?)(\.git)?$/i.exec(s);
  if (ssh) {
    const pathPart = ssh[2].replace(/\.git$/i, '');
    return `https://${ssh[1]}/${pathPart}`;
  }
  try {
    const url = new URL(s.replace(/\.git$/i, ''));
    return `${url.origin}${url.pathname.replace(/\/$/, '')}`;
  } catch {
    return null;
  }
}

/**
 * 生成在浏览器中打开仓库内某文件版本的链接（GitHub / GitLab / Gitee 等常见托管）
 */
export function gitBlobViewerUrl(gitUrl: string, branch: string, relativePath: string): string | null {
  const root = normalizeGitWebRoot(gitUrl);
  const b = (branch || '').trim();
  const p = (relativePath || '').trim().replace(/^\/+/, '');
  if (!root || !b || !p) return null;

  let host: string;
  try {
    host = new URL(root).hostname.toLowerCase();
  } catch {
    return null;
  }

  const encodedFile = p.split('/').map(encodeURIComponent).join('/');
  const encBranch = encodeURIComponent(b);

  if (host === 'github.com' || host.endsWith('.github.com')) {
    return `${root}/blob/${encBranch}/${encodedFile}`;
  }
  if (host.includes('gitee.com')) {
    return `${root}/blob/${encBranch}/${encodedFile}`;
  }
  if (host.includes('gitlab') || host.includes('codeberg.org')) {
    return `${root}/-/blob/${encBranch}/${encodedFile}`;
  }
  if (host.includes('bitbucket.org')) {
    return `${root}/src/${encBranch}/${encodedFile}`;
  }

  return null;
}
