"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Clock, Users, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { calculatePoints } from "@/lib/utils";
import { useRoomRealtime } from "@/hooks/use-room-realtime";
import type { Presentation, QuestionWithOptions } from "@/lib/supabase/types";

type AnswerFeedback = {
  isCorrect: boolean;
  points: number;
  optionId: string;
};

type SlideState = "waiting" | "question-only" | "answering" | "feedback" | "leaderboard" | "ended";

export default function ParticipantRoomPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const roomCode = params.code;
  const [nickname, setNickname] = useState("");
  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const [questions, setQuestions] = useState<QuestionWithOptions[] | null>(null);
  const [startedAt, setStartedAt] = useState(Date.now());
  const [feedback, setFeedback] = useState<AnswerFeedback | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [status, setStatus] = useState("Joining room...");
  const [loadAttempted, setLoadAttempted] = useState(false);
  const [showingOptions, setShowingOptions] = useState(false);
  const room = useRoomRealtime(roomCode, nickname);

  const activeQuestion = presentation && questions
    ? questions[presentation.current_slide_index]
    : undefined;

  const slideState: SlideState = !presentation?.is_live || presentation.current_slide_index === -1
    ? "waiting"
    : feedback
      ? "feedback"
      : activeQuestion
        ? (showingOptions ? "answering" : "question-only")
        : "ended";

  useEffect(() => {
    const storedName = sessionStorage.getItem(`fikavo:nickname:${roomCode}`);
    if (!storedName) {
      router.replace(`/join?code=${roomCode}`);
      return;
    }
    setNickname(storedName);
  }, [roomCode, router]);

  useEffect(() => {
    if (loadAttempted) return;

    async function loadRoom() {
      setLoadAttempted(true);
      const { data: deck, error } = await supabase
        .from("presentations")
        .select("*")
        .eq("room_code", roomCode)
        .maybeSingle();

      if (error || !deck) {
        setStatus("Waiting for the host to start...");
        return;
      }

      const { data: loadedQuestions } = await supabase
        .from("questions")
        .select("*, options(*)")
        .eq("presentation_id", deck.id)
        .order("order_index", { ascending: true });

      setPresentation(deck);
      setQuestions((loadedQuestions ?? []) as QuestionWithOptions[]);
      setStatus("Waiting for the presenter to start.");
    }

    void loadRoom();
  }, [roomCode, supabase, loadAttempted]);

  useEffect(() => {
    if (room.presentation) {
      setPresentation(room.presentation);
    }
  }, [room.presentation]);

  useEffect(() => {
    if (presentation?.is_live && !questions) {
      supabase
        .from("questions")
        .select("*, options(*)")
        .eq("presentation_id", presentation.id)
        .order("order_index", { ascending: true })
        .then(({ data }) => {
          if (data) setQuestions(data as QuestionWithOptions[]);
        });
    }
  }, [presentation?.is_live, presentation?.id, questions, supabase]);

  useEffect(() => {
    if (!room.lastEvent) return;
    if (room.lastEvent.type === "slide-change") {
      setFeedback(null);
      setShowingOptions(false);
    }
    if (room.lastEvent.type === "options-show") {
      setShowingOptions(true);
      setStartedAt(new Date(room.lastEvent.startedAt).getTime());
    }
    if (room.lastEvent.type === "quiz-ended") {
      setPresentation((current) =>
        current ? { ...current, is_live: false, current_slide_index: -1 } : current
      );
    }
  }, [room.lastEvent]);

  let currentSlideState: SlideState = slideState;
  if (room.lastEvent?.type === "leaderboard-show") {
    currentSlideState = "leaderboard";
  }

  const answer = useCallback(async (optionId: string) => {
    if (!activeQuestion || feedback) return;
    const selectedOption = activeQuestion.options.find((o) => o.id === optionId);
    if (!selectedOption) return;

    const timeTaken = Math.max(0, Date.now() - startedAt);
    const points = calculatePoints(timeTaken, activeQuestion.time_limit, selectedOption.is_correct);
    setFeedback({ isCorrect: selectedOption.is_correct, points, optionId });

    await supabase.from("responses").insert({
      room_code: roomCode,
      user_nickname: nickname,
      question_id: activeQuestion.id,
      option_id: optionId,
      points_earned: points,
      time_taken: timeTaken
    });
  }, [activeQuestion, feedback, startedAt, supabase, roomCode, nickname]);

  useEffect(() => {
    if (currentSlideState !== "answering" || !activeQuestion || feedback) return;

    const interval = setInterval(() => {
      const elapsed = (Date.now() - startedAt) / 1000;
      const remaining = Math.max(0, Math.ceil(activeQuestion.time_limit - elapsed));
      setTimeLeft(remaining);

      if (remaining <= 0) {
        setFeedback({ isCorrect: false, points: 0, optionId: "timeout" });
      }
    }, 200);

    return () => clearInterval(interval);
  }, [currentSlideState, activeQuestion, startedAt, feedback]);

  return (
    <main className="flex min-h-dvh flex-col bg-gradient-to-b from-white to-surface-muted">
      <header className="border-b border-surface-border bg-white/80 backdrop-blur-lg pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-lg items-center justify-between px-5 py-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-fikavo-600">Fikavo Live</p>
            <h1 className="text-lg font-bold text-slate-900">Room {roomCode}</h1>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-fikavo-50 px-3 py-1.5 text-xs font-semibold text-fikavo-700">
            <Users className="size-3.5" />
            {room.activeCount}
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col px-5 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <AnimatePresence mode="wait">
          {currentSlideState === "waiting" && (
            <motion.div
              key="waiting"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
              className="flex flex-1 flex-col items-center justify-center"
            >
              <div className="rounded-2xl border border-surface-border bg-white p-8 text-center shadow-card">
                <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-2xl bg-fikavo-100">
                  <Clock className="size-8 text-fikavo-600" />
                </div>
                <h2 className="text-2xl font-black text-slate-900">You are in, {nickname}!</h2>
                <p className="mt-2 text-sm text-slate-500">{status}</p>
                <div className="mt-6 flex items-center justify-center gap-2 text-sm text-slate-400">
                  <div className="size-2 animate-pulse rounded-full bg-fikavo-500" />
                  Waiting for the host to start
                </div>
              </div>
            </motion.div>
          )}

          {currentSlideState === "question-only" && activeQuestion && (
            <motion.div
              key={activeQuestion.id + "-qonly"}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
              className="flex flex-1 flex-col items-center justify-center"
            >
              <div className="rounded-2xl border border-surface-border bg-white p-8 text-center shadow-card w-full">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Question {presentation ? presentation.current_slide_index + 1 : "?"}
                </p>
                <h2 className="text-2xl font-black leading-tight text-slate-900 mb-6">
                  {activeQuestion.question_text}
                </h2>
                <div className="flex justify-center gap-1">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="size-2 animate-bounce rounded-full bg-fikavo-400"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
                <p className="mt-4 text-sm text-slate-500">
                  Look at the big screen! Options will appear shortly.
                </p>
              </div>
            </motion.div>
          )}

          {currentSlideState === "answering" && activeQuestion && (
            <motion.div
              key={activeQuestion.id + "-ans"}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
              className="flex flex-1 flex-col justify-center"
            >
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Question {presentation ? presentation.current_slide_index + 1 : "?"}
                </p>
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                  timeLeft <= 5 ? "bg-red-50 text-red-700 animate-pulse" : "bg-amber-50 text-amber-700"
                }`}>
                  {timeLeft}s
                </span>
              </div>
              <h2 className="mb-6 text-xl font-black leading-tight text-slate-900">
                {activeQuestion.question_text}
              </h2>
              <div className="flex flex-col gap-3">
                {activeQuestion.options.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => answer(option.id)}
                    className="min-h-14 w-full rounded-2xl border-2 border-surface-border bg-white px-5 text-left text-base font-semibold text-slate-800 shadow-sm transition-all active:scale-[0.98] active:border-fikavo-400 active:bg-fikavo-50 hover:border-fikavo-300"
                  >
                    {option.option_text}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {currentSlideState === "feedback" && (
            <motion.div
              key="feedback"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-1 flex-col items-center justify-center"
            >
              <div className={`rounded-2xl border p-8 text-center shadow-card w-full ${
                feedback?.isCorrect
                  ? "border-green-200 bg-green-50"
                  : "border-red-200 bg-red-50"
              }`}>
                {feedback?.isCorrect ? (
                  <CheckCircle2 className="mx-auto mb-4 size-16 text-green-500" />
                ) : (
                  <XCircle className="mx-auto mb-4 size-16 text-red-500" />
                )}
                <h2 className={`text-3xl font-black ${
                  feedback?.isCorrect ? "text-green-700" : "text-red-700"
                }`}>
                  {feedback?.optionId === "timeout" ? "Time's Up!" : feedback?.isCorrect ? "Correct!" : "Not this time"}
                </h2>
                {feedback && (
                  <p className={`mt-2 text-3xl font-black ${
                    feedback?.isCorrect ? "text-fikavo-600" : "text-slate-400"
                  }`}>
                    +{feedback.points}
                  </p>
                )}
                <p className="mt-6 text-sm text-slate-500">
                  Waiting for the next question...
                </p>
                <div className="mt-4 flex justify-center gap-1">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="size-2 animate-bounce rounded-full bg-fikavo-400"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {currentSlideState === "leaderboard" && (
            <motion.div
              key="leaderboard"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-1 flex-col items-center justify-center"
            >
              <div className="rounded-2xl border border-surface-border bg-white p-8 text-center shadow-card w-full">
                <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-amber-100">
                  <span className="text-3xl">🏆</span>
                </div>
                <h2 className="text-2xl font-black text-slate-900">Look at the big screen!</h2>
                <p className="mt-2 text-sm text-slate-500">
                  The leaderboard is up. Let's see who's winning!
                </p>
                <div className="mt-6 flex justify-center gap-1">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="size-2 animate-bounce rounded-full bg-amber-400"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {currentSlideState === "ended" && (
            <motion.div
              key="ended"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
              className="flex flex-1 flex-col items-center justify-center"
            >
              <div className="rounded-2xl border border-surface-border bg-white p-8 text-center shadow-card">
                <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-slate-100">
                  <CheckCircle2 className="size-8 text-slate-500" />
                </div>
                <h2 className="text-2xl font-black text-slate-900">Quiz ended</h2>
                <p className="mt-2 text-sm text-slate-500">
                  Thanks for playing, {nickname}!
                </p>
                <Button
                  className="mt-6"
                  onClick={() => router.push("/join")}
                >
                  Join another room
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
