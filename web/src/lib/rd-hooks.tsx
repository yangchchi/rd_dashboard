import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { rdApi } from './rd-api';
import type {
  IAcceptanceRecord,
  IOrganizationSpecConfig,
  IPipelineTask,
  IPrd,
  IRequirement,
  ISpecification,
} from './rd-types';

export const rdKeys = {
  requirements: ['rd', 'requirements'] as const,
  prds: ['rd', 'prds'] as const,
  specs: ['rd', 'specs'] as const,
  orgSpec: ['rd', 'orgSpec'] as const,
  acceptance: ['rd', 'acceptance'] as const,
  pipelineTasks: ['rd', 'pipeline-tasks'] as const,
};

export function useRequirementsList() {
  return useQuery({
    queryKey: rdKeys.requirements,
    queryFn: () => rdApi.listRequirements(),
  });
}

export function useRequirement(id: string | undefined) {
  return useQuery({
    queryKey: [...rdKeys.requirements, id],
    queryFn: () => (id ? rdApi.getRequirement(id) : Promise.resolve(null)),
    enabled: Boolean(id),
  });
}

export function useUpsertRequirement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<IRequirement> & { id: string }) => rdApi.upsertRequirement(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: rdKeys.requirements });
    },
  });
}

export function useAcceptRequirementTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      requirementId: string;
      role: 'pm' | 'tm';
      userId: string;
      userName?: string;
    }) =>
      rdApi.acceptRequirementTask(args.requirementId, {
        role: args.role,
        userId: args.userId,
        userName: args.userName,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: rdKeys.requirements });
    },
  });
}

export function useDeleteRequirement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => rdApi.deleteRequirement(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: rdKeys.requirements });
    },
  });
}

export function usePrdsList() {
  return useQuery({
    queryKey: rdKeys.prds,
    queryFn: () => rdApi.listPrds(),
  });
}

export function usePrd(id: string | undefined) {
  return useQuery({
    queryKey: [...rdKeys.prds, id],
    queryFn: () => (id ? rdApi.getPrd(id) : Promise.resolve(null)),
    enabled: Boolean(id),
  });
}

export function useUpsertPrd() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<IPrd> & { id: string; requirementId: string }) => rdApi.upsertPrd(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: rdKeys.prds });
      void qc.invalidateQueries({ queryKey: rdKeys.requirements });
    },
  });
}

export function useDeletePrd() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => rdApi.deletePrd(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: rdKeys.prds });
      void qc.invalidateQueries({ queryKey: rdKeys.requirements });
    },
  });
}

export function useSubmitPrdReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { prdId: string; reviewer?: string; comment?: string }) =>
      rdApi.submitPrdForReview(args.prdId, args.reviewer, args.comment),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: rdKeys.prds });
    },
  });
}

export function useReviewPrd() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      prdId: string;
      status: 'approved' | 'rejected';
      reviewer?: string;
      comment?: string;
    }) => rdApi.reviewPrd(args.prdId, args.status, args.reviewer, args.comment),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: rdKeys.prds });
      void qc.invalidateQueries({ queryKey: rdKeys.requirements });
    },
  });
}

export function useSpecsList() {
  return useQuery({
    queryKey: rdKeys.specs,
    queryFn: () => rdApi.listSpecs(),
  });
}

export function useSpec(id: string | undefined) {
  return useQuery({
    queryKey: [...rdKeys.specs, id],
    queryFn: () => (id ? rdApi.getSpec(id) : Promise.resolve(null)),
    enabled: Boolean(id),
  });
}

export function useUpsertSpec() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<ISpecification> & { id: string; prdId: string }) =>
      rdApi.upsertSpec(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: rdKeys.specs });
    },
  });
}

export function useDeleteSpec() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => rdApi.deleteSpec(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: rdKeys.specs });
    },
  });
}

export function useSubmitSpecReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { specId: string; reviewer?: string; comment?: string }) =>
      rdApi.submitSpecForReview(args.specId, args.reviewer, args.comment),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: rdKeys.specs });
    },
  });
}

export function useApproveSpec() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { specId: string; reviewer?: string; comment?: string }) =>
      rdApi.approveSpec(args.specId, args.reviewer, args.comment),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: rdKeys.specs });
      void qc.invalidateQueries({ queryKey: rdKeys.requirements });
    },
  });
}

export function useRejectSpec() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { specId: string; reviewer?: string; comment?: string }) =>
      rdApi.rejectSpec(args.specId, args.reviewer, args.comment),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: rdKeys.specs });
    },
  });
}

export function useOrgSpecConfig() {
  return useQuery({
    queryKey: rdKeys.orgSpec,
    queryFn: () => rdApi.getOrgSpecConfig(),
  });
}

export function useSaveOrgSpecConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (config: IOrganizationSpecConfig) => rdApi.saveOrgSpecConfig(config),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: rdKeys.orgSpec });
    },
  });
}

export function useAcceptanceRecords() {
  return useQuery({
    queryKey: rdKeys.acceptance,
    queryFn: () => rdApi.listAcceptanceRecords(),
  });
}

export function useAddAcceptanceRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (record: IAcceptanceRecord) => rdApi.addAcceptanceRecord(record),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: rdKeys.acceptance });
      void qc.invalidateQueries({ queryKey: rdKeys.requirements });
    },
  });
}

export function usePipelineTasksList() {
  return useQuery({
    queryKey: rdKeys.pipelineTasks,
    queryFn: () => rdApi.listPipelineTasks(),
  });
}

export function useUpsertPipelineTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<IPipelineTask> & { id: string; requirementId: string }) =>
      rdApi.upsertPipelineTask(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: rdKeys.pipelineTasks });
    },
  });
}

export function useDeletePipelineTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => rdApi.deletePipelineTask(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: rdKeys.pipelineTasks });
    },
  });
}
