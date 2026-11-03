import { useMemo, useRef } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch, type FieldErrors } from 'react-hook-form';
import type { QuestionAnswer, SessionApproval } from '@devhub/contracts';
import { Button, ChoiceCard, ChoiceGroup, Field, Input } from '@devhub/ui';
import { questionWords } from '../approval-words.ts';
import { otherChoice, questionFormSchema, type QuestionFormValues } from '../schemas.ts';

type QuestionApproval = Extract<SessionApproval, { kind: 'question' }>;

/**
 * Claude's questions inside the approval callout (spec 051, Q1a): each a group named by its question, under its
 * header, with a card for each choice and Other, which opens a box for your own answer. A question that takes several
 * has checkboxes (Q2a). Send answer and Skip sit inside it, where the callout's buttons go, so Enter in Other's box
 * sends (the forms skill).
 */
export function QuestionForm({
  approval,
  busy,
  error: failed,
  onAnswer,
  onSkip,
}: {
  approval: QuestionApproval;
  /** The answer on its way: its button shows it, and the other waits (AC-11). */
  busy: 'answer' | 'skip' | null;
  /** Why the last answer didn't go (AC-10), above the buttons as the callout puts it. */
  error: string | null;
  onAnswer: (answers: QuestionAnswer[]) => void;
  onSkip: () => void;
}) {
  const { questions } = approval;
  const schema = useMemo(() => questionFormSchema(questions), [questions]);
  const form = useForm<QuestionFormValues, unknown, QuestionAnswer[]>({
    resolver: zodResolver(schema),
    defaultValues: { answers: questions.map((one) => ({ picked: one.multiSelect ? [] : null, other: '' })) },
    // react-hook-form can't focus one radio of a group, so the first question missing an answer is focused here.
    shouldFocusError: false,
  });
  const answers = useWatch({ control: form.control, name: 'answers' });
  const groups = useRef<HTMLFormElement>(null);
  const { errors } = form.formState;

  function focusFirstMissing(failed: FieldErrors<QuestionFormValues>) {
    const index = questions.findIndex((_, at) => failed.answers?.[at] !== undefined);
    if (index === -1) return;
    if (failed.answers?.[index]?.other !== undefined) form.setFocus(`answers.${index}.other`);
    else groups.current?.querySelectorAll('fieldset')[index]?.querySelector('input')?.focus();
  }

  return (
    <form
      ref={groups}
      noValidate
      // A label or a question with no spaces still wraps inside the callout (AC-20).
      className="flex flex-col gap-4 wrap-anywhere"
      onSubmit={(event) => void form.handleSubmit(onAnswer, focusFirstMissing)(event)}
    >
      {questions.map((question, index) => {
        const name = `answers.${index}.picked` as const;
        const picked = answers[index]?.picked ?? null;
        const otherOn = picked === otherChoice || (Array.isArray(picked) && picked.includes(otherChoice));
        const error = errors.answers?.[index];
        return (
          <div key={question.question} className="flex flex-col gap-1">
            {question.header === '' ? null : <p className="m-0 text-small text-muted-foreground">{question.header}</p>}
            <ChoiceGroup legend={question.question} multiple={question.multiSelect} error={error?.picked?.message}>
              {question.options.map((option, place) => (
                <ChoiceCard
                  key={option.label}
                  multiple={question.multiSelect}
                  title={option.label}
                  detail={option.description}
                  value={String(place)}
                  {...form.register(name)}
                />
              ))}
              <ChoiceCard
                multiple={question.multiSelect}
                title={questionWords.other}
                value={otherChoice}
                {...form.register(name)}
              />
              {otherOn ? (
                <Field label={questionWords.yourAnswer} error={error?.other?.message}>
                  <Input {...form.register(`answers.${index}.other`)} />
                </Field>
              ) : null}
            </ChoiceGroup>
          </div>
        );
      })}
      {failed === null ? null : <p className="m-0 text-small text-danger">{failed}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" variant="primary" pending={busy === 'answer'} disabled={busy === 'skip'}>
          {questionWords.send}
        </Button>
        <Button size="sm" variant="ghost" pending={busy === 'skip'} disabled={busy === 'answer'} onClick={onSkip}>
          {questionWords.skip}
        </Button>
      </div>
    </form>
  );
}
