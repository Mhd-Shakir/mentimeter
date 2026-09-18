"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, CheckCircle2, Play, Edit3 } from "lucide-react";
import { BrandShell } from "@/components/brand-shell";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { Presentation, QuestionWithOptions } from "@/lib/supabase/types";
import styles from "./edit-deck.module.css";

const MAX_QUESTIONS = 20;

export default function EditDeckPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  
  const [deck, setDeck] = useState<Presentation | null>(null);
  const [questions, setQuestions] = useState<QuestionWithOptions[]>([]);
  const [status, setStatus] = useState("Loading deck...");
  const [loading, setLoading] = useState(true);
  
  // Title editing state
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");

  // Edit question state
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);

  // New question form state
  const [questionText, setQuestionText] = useState("");
  const [timeLimit, setTimeLimit] = useState(20);
  const [options, setOptions] = useState([
    { text: "", isCorrect: true },
    { text: "", isCorrect: false },
    { text: "", isCorrect: false },
    { text: "", isCorrect: false },
  ]);

  useEffect(() => {
    async function load() {
      if (!params.id) return;
      
      const { data: presentation, error: deckError } = await supabase
        .from("presentations")
        .select("*")
        .eq("id", params.id)
        .single();

      if (deckError || !presentation) {
        setStatus(deckError?.message ?? "Deck not found.");
        setLoading(false);
        return;
      }

      const { data: loadedQuestions, error: questionError } = await supabase
        .from("questions")
        .select("*, options(*)")
        .eq("presentation_id", params.id)
        .order("order_index", { ascending: true });

      setDeck(presentation);
      setEditedTitle(presentation.title);
      setQuestions((loadedQuestions ?? []) as QuestionWithOptions[]);
      setStatus("");
      setLoading(false);
    }

    load();
  }, [params.id, supabase]);

  async function handleUpdateTitle(e: FormEvent) {
    e.preventDefault();
    if (!deck || !editedTitle.trim() || editedTitle === deck.title) {
      setIsEditingTitle(false);
      return;
    }
    
    setStatus("Updating title...");
    const { error } = await supabase
      .from("presentations")
      .update({ title: editedTitle.trim() })
      .eq("id", deck.id);
      
    if (error) {
      setStatus(error.message);
      return;
    }
    
    setDeck({ ...deck, title: editedTitle.trim() });
    setIsEditingTitle(false);
    setStatus("Title updated.");
  }

  function handleEditClick(q: QuestionWithOptions) {
    setEditingQuestionId(q.id);
    setQuestionText(q.question_text);
    setTimeLimit(q.time_limit);
    
    const newOptions = [
      { text: "", isCorrect: true },
      { text: "", isCorrect: false },
      { text: "", isCorrect: false },
      { text: "", isCorrect: false },
    ];
    
    q.options.forEach((opt, idx) => {
      if (idx < 4) {
        newOptions[idx] = { text: opt.option_text, isCorrect: opt.is_correct };
      }
    });
    
    // Ensure exactly one is correct if somehow none are
    if (!newOptions.some(o => o.isCorrect)) {
        newOptions[0].isCorrect = true;
    }
    
    setOptions(newOptions);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleCancelEdit() {
    setEditingQuestionId(null);
    setQuestionText("");
    setTimeLimit(20);
    setOptions([
      { text: "", isCorrect: true },
      { text: "", isCorrect: false },
      { text: "", isCorrect: false },
      { text: "", isCorrect: false },
    ]);
    setStatus("");
  }

  async function handleSaveQuestion(e: FormEvent) {
    e.preventDefault();
    if (!deck) return;
    if (!editingQuestionId && questions.length >= MAX_QUESTIONS) return;
    
    // Validation
    if (!questionText.trim()) {
      setStatus("Question text is required.");
      return;
    }
    const validOptions = options.filter(o => o.text.trim());
    if (validOptions.length < 2) {
      setStatus("At least two options are required.");
      return;
    }
    if (!validOptions.some(o => o.isCorrect)) {
      setStatus("At least one correct option must be selected.");
      return;
    }

    setStatus(editingQuestionId ? "Updating question..." : "Adding question...");
    
    if (editingQuestionId) {
      // Update existing question
      const { data: updatedQuestion, error: qError } = await supabase
        .from("questions")
        .update({
          question_text: questionText,
          time_limit: timeLimit,
        })
        .eq("id", editingQuestionId)
        .select()
        .single();

      if (qError || !updatedQuestion) {
        setStatus(qError?.message ?? "Failed to update question.");
        return;
      }

      // Delete old options
      const { error: delError } = await supabase
        .from("options")
        .delete()
        .eq("question_id", editingQuestionId);

      if (delError) {
         setStatus(delError.message);
         return;
      }

      // Insert new options
      const optionsToInsert = validOptions.map(opt => ({
        question_id: editingQuestionId,
        option_text: opt.text.trim(),
        is_correct: opt.isCorrect
      }));

      const { data: createdOptions, error: optError } = await supabase
        .from("options")
        .insert(optionsToInsert)
        .select();

      if (optError) {
        setStatus(optError.message);
        return;
      }

      // Update Local State
      const newQuestion: QuestionWithOptions = {
        ...updatedQuestion,
        options: createdOptions ?? []
      };
      
      setQuestions(prev => prev.map(q => q.id === editingQuestionId ? newQuestion : q));
      
      handleCancelEdit();
      setStatus("Question updated successfully!");
    } else {
      const orderIndex = questions.length;
      
      // Insert Question
      const { data: createdQuestion, error: qError } = await supabase
        .from("questions")
        .insert({
          presentation_id: deck.id,
          question_text: questionText,
          time_limit: timeLimit,
          order_index: orderIndex
        })
        .select()
        .single();

      if (qError || !createdQuestion) {
        setStatus(qError?.message ?? "Failed to add question.");
        return;
      }

      // Insert Options
      const optionsToInsert = validOptions.map(opt => ({
        question_id: createdQuestion.id,
        option_text: opt.text.trim(),
        is_correct: opt.isCorrect
      }));

      const { data: createdOptions, error: optError } = await supabase
        .from("options")
        .insert(optionsToInsert)
        .select();

      if (optError) {
        setStatus(optError.message);
        return;
      }

      // Update Local State
      const newQuestion: QuestionWithOptions = {
        ...createdQuestion,
        options: createdOptions ?? []
      };
      
      setQuestions(prev => [...prev, newQuestion]);
      
      handleCancelEdit();
      setStatus("Question added successfully!");
    }
  }

  async function handleDeleteQuestion(questionId: string) {
    setStatus("Deleting question...");
    const { error } = await supabase
      .from("questions")
      .delete()
      .eq("id", questionId);
      
    if (error) {
      setStatus(error.message);
      return;
    }
    
    setQuestions(prev => prev.filter(q => q.id !== questionId));
    setStatus("Question deleted.");
  }

  function handleOptionTextChange(index: number, text: string) {
    const newOptions = [...options];
    newOptions[index].text = text;
    setOptions(newOptions);
  }

  function handleOptionCorrectChange(index: number) {
    const newOptions = options.map((opt, i) => ({
      ...opt,
      isCorrect: i === index // Only one correct answer for now
    }));
    setOptions(newOptions);
  }

  if (loading) {
    return (
      <BrandShell>
        <div className={styles.loader}>
          <div className={styles.spinner} />
        </div>
      </BrandShell>
    );
  }

  if (!deck) {
    return (
      <BrandShell>
        <div className={styles.container}>
          <p className={styles.statusMessage}>{status}</p>
          <Button asChild className="mt-4"><Link href="/dashboard">Back to Dashboard</Link></Button>
        </div>
      </BrandShell>
    );
  }

  return (
    <BrandShell>
      <div className={styles.container}>
        <div className={styles.header}>
          <Link href="/dashboard" className={styles.backLink}>
            <ArrowLeft size={20} /> Dashboard
          </Link>
          <span className="text-slate-300">/</span>
          {isEditingTitle ? (
            <form onSubmit={handleUpdateTitle} className="flex-1 max-w-sm flex gap-2">
              <input
                autoFocus
                className={styles.input}
                style={{ padding: "0.25rem 0.5rem", margin: 0, minHeight: "auto", fontSize: "1.25rem", fontWeight: "bold" }}
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                onBlur={handleUpdateTitle}
              />
            </form>
          ) : (
            <h1 
              className={`${styles.title} cursor-pointer hover:opacity-80 flex items-center gap-2`}
              onClick={() => setIsEditingTitle(true)}
              title="Click to edit title"
            >
              {deck.title}
              <Edit3 size={16} className="text-slate-400" />
            </h1>
          )}
          <Button size="sm" asChild style={{ marginLeft: "auto" }}>
            <Link href={`/present/${deck.id}`}>
              <Play size={14} className="mr-1"/> Present
            </Link>
          </Button>
        </div>

        <div className={styles.grid}>
          {/* Add Question Form */}
          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>
              {editingQuestionId ? "Edit Question" : "Add Question"}
              {!editingQuestionId && (
                <span className="text-sm font-normal text-slate-400">
                  ({questions.length}/{MAX_QUESTIONS})
                </span>
              )}
            </h2>
            
            {!editingQuestionId && questions.length >= MAX_QUESTIONS ? (
              <p className={styles.limitWarning}>You have reached the maximum limit of {MAX_QUESTIONS} questions per deck.</p>
            ) : (
              <form onSubmit={handleSaveQuestion}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Question Text</label>
                  <input
                    className={styles.input}
                    value={questionText}
                    onChange={(e) => setQuestionText(e.target.value)}
                    placeholder="e.g. What is the capital of France?"
                    required
                  />
                </div>
                
                <div className={styles.formGroup}>
                  <label className={styles.label}>Time Limit (seconds)</label>
                  <input
                    type="number"
                    min="5"
                    max="120"
                    className={styles.input}
                    value={timeLimit}
                    onChange={(e) => setTimeLimit(parseInt(e.target.value))}
                    required
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>Options (select the correct one)</label>
                  <div className={styles.optionsGrid}>
                    {options.map((option, index) => (
                      <div key={index} className={styles.optionItem}>
                        <input
                          type="radio"
                          name="correctOption"
                          id={`correct-${index}`}
                          className={styles.radioInput}
                          checked={option.isCorrect}
                          onChange={() => handleOptionCorrectChange(index)}
                        />
                        <label htmlFor={`correct-${index}`} className={styles.radioLabel}>
                          {option.isCorrect && <CheckCircle2 size={16} />}
                        </label>
                        <input
                          className={styles.input}
                          value={option.text}
                          onChange={(e) => handleOptionTextChange(index, e.target.value)}
                          placeholder={`Option ${index + 1}`}
                          required={index < 2} // Require at least first two options
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: "flex", gap: "1rem" }}>
                  <Button type="submit" style={{ flex: 1 }}>
                    {editingQuestionId ? (
                      <><Edit3 size={16} /> Update Question</>
                    ) : (
                      <><Plus size={16} /> Add Question</>
                    )}
                  </Button>
                  {editingQuestionId && (
                    <Button type="button" variant="outline" onClick={handleCancelEdit} style={{ flex: 1, backgroundColor: "var(--bg-tertiary)", color: "var(--text-primary)" }}>
                      Cancel
                    </Button>
                  )}
                </div>
              </form>
            )}
            
            {status && (
              <div className={styles.statusMessage}>{status}</div>
            )}
          </div>

          {/* Existing Questions List */}
          <div>
            <h2 className={styles.panelTitle} style={{ marginBottom: "1rem" }}>
              Questions
            </h2>
            
            <div className={styles.questionList}>
              {questions.length === 0 ? (
                <div className="text-center p-8 bg-white rounded-xl border border-slate-200 text-slate-500">
                  No questions yet. Add one to get started!
                </div>
              ) : (
                questions.map((q, index) => (
                  <div key={q.id} className={styles.questionCard}>
                    <div className={styles.questionHeader}>
                      <div>
                        <span className="text-xs font-bold text-slate-400 uppercase mr-2">Q{index + 1}</span>
                        <span className={styles.questionText}>{q.question_text}</span>
                      </div>
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <button 
                          onClick={() => handleEditClick(q)}
                          className={styles.deleteButton}
                          title="Edit question"
                        >
                          <Edit3 size={16} />
                        </button>
                        <button 
                          onClick={() => handleDeleteQuestion(q.id)}
                          className={styles.deleteButton}
                          title="Delete question"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    <div className={styles.questionMeta}>
                      {q.time_limit} seconds
                    </div>
                    <div className={styles.questionOptions}>
                      {q.options.map(opt => (
                        <div key={opt.id} className={`${styles.optionText} ${opt.is_correct ? styles.correct : ""}`}>
                          {opt.is_correct && <CheckCircle2 size={12} />}
                          {opt.option_text}
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </BrandShell>
  );
}
