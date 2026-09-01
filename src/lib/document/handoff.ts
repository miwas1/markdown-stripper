import type { ConversionMode, DocumentReference, SafetyFinding } from './types';
import type { DeepScanStatus } from './pii';

export type HandoffReadiness = 'empty' | 'review' | 'ready';

export interface AgentHandoffInput {
  markdown: string;
  plainText: string;
  conversionMode: ConversionMode;
  appendReferences: boolean;
  references: DocumentReference[];
  brokenReferences: string[];
  safetyFindings: SafetyFinding[];
  deepScanStatus: DeepScanStatus;
  importWarnings: string[];
  humanApprovalGranted: boolean;
}

export interface AgentHandoffSummary {
  readiness: HandoffReadiness;
  headline: string;
  agentHandoffReady: boolean;
  reviewRequired: boolean;
  contentChecksPass: boolean;
  humanApprovalGranted: boolean;
  document: {
    inputCharacters: number;
    outputCharacters: number;
    outputMode: ConversionMode;
    wordCount: number;
    referenceCount: number;
    referencesAppended: boolean;
    brokenReferenceCount: number;
    importWarningCount: number;
  };
  privacy: {
    findingCount: number;
    highSeverityCount: number;
    mediumSeverityCount: number;
    lowSeverityCount: number;
    deepScanStatus: DeepScanStatus;
    detectionIsNotAGuarantee: true;
  };
  checks: {
    hasDocument: boolean;
    hasConvertedOutput: boolean;
    aiReadyMode: boolean;
    deepPrivacyScanComplete: boolean;
    noSafetyFindings: boolean;
    noBrokenReferences: boolean;
  };
  nextSteps: string[];
}

/**
 * Return a bounded, content-free readiness summary for an agent handoff.
 * The summary intentionally excludes document text so an agent can decide
 * what to do next before requesting the untrusted output itself.
 */
export function summarizeAgentHandoff(input: AgentHandoffInput): AgentHandoffSummary {
  const hasDocument = Boolean(input.markdown.trim());
  const hasConvertedOutput = Boolean(input.plainText.trim());
  const highSeverityCount = input.safetyFindings.filter(finding => finding.severity === 'high').length;
  const mediumSeverityCount = input.safetyFindings.filter(finding => finding.severity === 'medium').length;
  const lowSeverityCount = input.safetyFindings.filter(finding => finding.severity === 'low').length;
  const aiReadyMode = input.conversionMode === 'ai';
  const deepPrivacyScanComplete = input.deepScanStatus === 'complete';
  const noSafetyFindings = input.safetyFindings.length === 0;
  const noBrokenReferences = input.brokenReferences.length === 0;
  const contentChecksPass = hasDocument
    && hasConvertedOutput
    && aiReadyMode
    && deepPrivacyScanComplete
    && noSafetyFindings
    && noBrokenReferences;
  const agentHandoffReady = contentChecksPass && input.humanApprovalGranted;

  const nextSteps: string[] = [];
  if (!hasDocument) nextSteps.push('Paste or import a document.');
  if (!hasConvertedOutput && hasDocument) nextSteps.push('Check the converted output before handing it to an agent.');
  if (!aiReadyMode && hasDocument) nextSteps.push('Set AI-ready mode for structured, clearly delimited context.');
  if (!deepPrivacyScanComplete && hasDocument) nextSteps.push('Run the deep local privacy scan and review its findings.');
  if (input.safetyFindings.length > 0) {
    nextSteps.push(`Review ${input.safetyFindings.length} local safety finding${input.safetyFindings.length === 1 ? '' : 's'} before sharing.`);
  }
  if (!noBrokenReferences) nextSteps.push(`Review ${input.brokenReferences.length} broken reference${input.brokenReferences.length === 1 ? '' : 's'}.`);
  if (input.importWarnings.length > 0) nextSteps.push('Review import warnings for reading-order or OCR limitations.');
  if (contentChecksPass && !input.humanApprovalGranted) nextSteps.push('Review the visible output, then approve the handoff in Insights before an agent can copy or export.');
  if (agentHandoffReady) nextSteps.push('The visible document is approved for agent-assisted review or export.');

  const readiness: HandoffReadiness = !hasDocument ? 'empty' : agentHandoffReady ? 'ready' : 'review';
  const headline = readiness === 'empty'
    ? 'Waiting for a document'
    : readiness === 'ready'
      ? 'Approved for an agent-assisted handoff'
      : contentChecksPass
        ? 'Human approval is the last step'
      : 'Human review is still needed';

  return {
    readiness,
    headline,
    agentHandoffReady,
    reviewRequired: readiness !== 'ready',
    contentChecksPass,
    humanApprovalGranted: input.humanApprovalGranted,
    document: {
      inputCharacters: input.markdown.length,
      outputCharacters: input.plainText.length,
      outputMode: input.conversionMode,
      wordCount: input.markdown.trim() ? input.markdown.trim().split(/\s+/).length : 0,
      referenceCount: input.references.length,
      referencesAppended: input.appendReferences,
      brokenReferenceCount: input.brokenReferences.length,
      importWarningCount: input.importWarnings.length,
    },
    privacy: {
      findingCount: input.safetyFindings.length,
      highSeverityCount,
      mediumSeverityCount,
      lowSeverityCount,
      deepScanStatus: input.deepScanStatus,
      detectionIsNotAGuarantee: true,
    },
    checks: {
      hasDocument,
      hasConvertedOutput,
      aiReadyMode,
      deepPrivacyScanComplete,
      noSafetyFindings,
      noBrokenReferences,
    },
    nextSteps,
  };
}
