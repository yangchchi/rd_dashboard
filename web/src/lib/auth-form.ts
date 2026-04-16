export function shouldTriggerAuthSubmitOnKeyDown(input: {
  key: string;
  isComposing?: boolean;
}): boolean {
  return input.key === 'Enter' && !input.isComposing;
}
