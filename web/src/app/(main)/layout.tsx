import { AiLauncher } from '@/components/ai-launcher/AiLauncher';
import Layout from '@/components/Layout';
import { RequireAuth } from '@/components/require-auth';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <Layout>{children}</Layout>
      <AiLauncher />
    </RequireAuth>
  );
}
