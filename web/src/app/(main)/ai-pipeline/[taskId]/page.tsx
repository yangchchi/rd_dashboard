'use client';

import { useParams } from 'next/navigation';
import AIPipelinePage from '@/screen/AIPipelinePage/AIPipelinePage';

export default function AIPipelineDetailRoute() {
  const params = useParams<{ taskId?: string }>();
  const raw = params?.taskId;
  const taskId = Array.isArray(raw) ? raw[0] : raw;
  return <AIPipelinePage view="detail" detailTaskId={taskId ?? ''} />;
}
