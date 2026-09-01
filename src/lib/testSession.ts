import { DisplayTestOption, ParticipantQuestion, TestOption } from '@/types';

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function deterministicShuffle<T>(items: T[], seed: string, identity: (item: T) => string): T[] {
  return [...items].sort((left, right) => {
    const difference = hash(`${seed}:${identity(left)}`) - hash(`${seed}:${identity(right)}`);
    return difference || identity(left).localeCompare(identity(right));
  });
}

export function orderTestQuestions(questions: ParticipantQuestion[], sessionId: string): ParticipantQuestion[] {
  return deterministicShuffle(questions, `${sessionId}:questions`, question => question.id);
}

export function getDisplayOptions(question: ParticipantQuestion, sessionId: string): DisplayTestOption[] {
  const options: Array<{ value: TestOption; text: string }> = [
    { value: 'A', text: question.option_a },
    { value: 'B', text: question.option_b },
    { value: 'C', text: question.option_c },
    { value: 'D', text: question.option_d }
  ];
  const labels: TestOption[] = ['A', 'B', 'C', 'D'];

  return deterministicShuffle(options, `${sessionId}:${question.id}:options`, option => option.value)
    .map((option, index) => ({ ...option, label: labels[index] }));
}
