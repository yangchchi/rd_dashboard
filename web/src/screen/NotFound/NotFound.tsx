'use client';
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-2xl font-semibold text-foreground">页面不存在</p>
      <p className="text-muted-foreground">请检查链接或返回首页。</p>
      <Link href="/" className="text-primary underline">
        回到首页
      </Link>
    </div>
  );
}
