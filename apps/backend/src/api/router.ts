import { wsHub } from '../ws/hub';
import { runAnalysis } from '../analysis/runner';

export function startAnalysisAsync(analysisId: string, username: string, models: Record<string, string>): void {
  runAnalysis(analysisId, username, models, (event) => {
    if (event.type === 'provider-update') wsHub.publish(event.analysisId, event);
    if (event.type === 'final') wsHub.publish(event.analysisId, event);
  });
}
