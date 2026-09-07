"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import { ArrowRight, BarChart3, Crown, Play, RadioTower, Square, Users, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { broadcastRoomEvent } from "@/lib/realtime/room-channel";
import { useRoomRealtime } from "@/hooks/use-room-realtime";
import type { Presentation, QuestionWithOptions, Response as ResponseType } from "@/lib/supabase/types";

export default function PresentPage() {
  const params = useParams<{ id: string }>();
  const supabase = useMemo(() => createClient(), []);
  const [deck, setDeck] = useState<Presentation | null>(null);
  const [questions, setQuestions] = useState<QuestionWithOptions[]>([]);
  const [responses, setResponses] = useState<ResponseType[]>([]);
  const [status, setStatus] = useState("Loading presenter screen...");
  const [loading, setLoading] = useState(true);
  const [showingLeaderboard, setShowingLeaderboard] = useState(false);
  const [showingResults, setShowingResults] = useState(false);
  const [startedAt, setStartedAt] = useState(Date.now());
  const [timeLeft, setTimeLeft] = useState(0);
  const room = useRoomRealtime(deck?.room_code ?? "");
  const activeQuestion = deck ? questions[deck.current_slide_index] : undefined;
  const joinUrl = typeof window === "undefined" || !deck ? "" : `${window.location.origin}/join?code=${deck.room_code}`;

  useEffect(() => {
    if (!params.id) return;

    async function load() {
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

      const { data: existingResponses } = await supabase
        .from("responses")
        .select("*")
        .eq("room_code", presentation.room_code);

      setDeck(presentation);
      setQuestions((loadedQuestions ?? []) as QuestionWithOptions[]);
      setResponses(existingResponses ?? []);
      setStatus(questionError?.message ?? "Ready to present.");
      setLoading(false);
    }

    void load();
  }, [params.id, supabase]);

  useEffect(() => {
    if (room.presentation) setDeck(room.presentation);
  }, [room.presentation]);

  useEffect(() => {
    if (room.responses.length) {
      setResponses((current) => {
        const known = new Set(current.map((r) => r.id));
        return [...current, ...room.responses.filter((r) => !known.has(r.id))];
      });
    }
  }, [room.responses]);

  useEffect(() => {
    if (!room.lastEvent) return;
    if (room.lastEvent.type === "slide-change") {
      setShowingLeaderboard(false);
      setShowingResults(false);
      setStartedAt(Date.now());
    }
  }, [room.lastEvent]);

  useEffect(() => {
    if (!deck?.is_live || !activeQuestion) return;

    const interval = setInterval(() => {
      const elapsed = (Date.now() - startedAt) / 1000;
      const remaining = Math.max(0, Math.ceil(activeQuestion.time_limit - elapsed));
      setTimeLeft(remaining);
    }, 200);

    return () => clearInterval(interval);
  }, [deck?.is_live, activeQuestion, startedAt]);

  const goToSlide = useCallback(async (slideIndex: number) => {
    if (!deck) return;
    const boundedIndex = Math.min(slideIndex, questions.length - 1);
    const patch = {
      is_live: true,
      current_slide_index: boundedIndex,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from("presentations")
      .update(patch)
      .eq("id", deck.id)
      .select()
      .single();

    if (error || !data) {
      setStatus(error?.message ?? "Could not change slide.");
      return;
    }

    setDeck(data);
    setShowingLeaderboard(false);
    setShowingResults(false);
    const now = new Date();
    setStartedAt(now.getTime());
    await broadcastRoomEvent(supabase, deck.room_code, {
      type: "slide-change",
      slideIndex: boundedIndex,
      startedAt: now.toISOString()
    });
  }, [deck, questions.length, supabase]);

  const showLeaderboard = useCallback(async () => {
    if (!deck) return;
    setShowingLeaderboard(true);
    await broadcastRoomEvent(supabase, deck.room_code, {
      type: "leaderboard-show",
      slideIndex: deck.current_slide_index
    });
  }, [deck, supabase]);

  const endQuiz = useCallback(async () => {
    if (!deck) return;
    await supabase
      .from("presentations")
      .update({ is_live: false, current_slide_index: -1, updated_at: new Date().toISOString() })
      .eq("id", deck.id);
    await broadcastRoomEvent(supabase, deck.room_code, { type: "quiz-ended", endedAt: new Date().toISOString() });
    setDeck((current) => current ? { ...current, is_live: false, current_slide_index: -1 } : current);
    setStatus("Quiz ended.");
  }, [deck, supabase]);

  const currentResponses = activeQuestion
    ? responses.filter((r) => r.question_id === activeQuestion.id)
    : [];

  const optionVotes = useMemo(() => {
    if (!activeQuestion) return [];
    return activeQuestion.options.map((option) => {
      const count = currentResponses.filter((r) => r.option_id === option.id).length;
      const pct = currentResponses.length ? Math.round((count / currentResponses.length) * 100) : 0;
      const correct = option.is_correct;
      return { ...option, count, pct, correct };
    });
  }, [activeQuestion, currentResponses]);

  const leaderboard = useMemo(() =>
    Object.values(
      responses.reduce<Record<string, { nickname: string; points: number }>>((acc, r) => {
        acc[r.user_nickname] ??= { nickname: r.user_nickname, points: 0 };
        acc[r.user_nickname].points += r.points_earned;
        return acc;
      }, {})
    ).sort((a, b) => b.points - a.points),
    [responses]
  );

  if (loading) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-surface">
        <div className="size-8 animate-spin rounded-full border-4 border-surface-border border-t-fikavo-600" />
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-surface">
      <header className="sticky top-0 z-50 border-b border-surface-border bg-white/80 backdrop-blur-lg pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-sm font-semibold text-slate-500 hover:text-slate-700">
              &larr; Dashboard
            </Link>
            <span className="text-slate-300">/</span>
            <h1 className="text-base font-bold text-slate-900 truncate max-w-48">{deck?.title ?? "Loading"}</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-fikavo-50 px-3 py-1.5 text-xs font-semibold text-fikavo-700">
              <Users className="size-3.5" />
              {room.activeCount}
            </span>
            {deck?.current_slide_index === -1 ? (
              <Button size="sm" onClick={() => goToSlide(0)}>
                <Play className="size-3.5" />
                Start
              </Button>
            ) : !showingLeaderboard ? (
              <>
                <Button size="sm" variant="outline" className="bg-white" onClick={() => setShowingResults(!showingResults)}>
                  {showingResults ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  {showingResults ? "Hide Results" : "Show Results"}
                </Button>
                <Button size="sm" onClick={showLeaderboard}>
                  <Crown className="size-3.5" />
                  Show Leaderboard
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={() => goToSlide((deck?.current_slide_index ?? 0) + 1)} disabled={(deck?.current_slide_index ?? 0) >= questions.length - 1}>
                <ArrowRight className="size-3.5" />
                Next Question
              </Button>
            )}
            <Button size="sm" variant="danger" onClick={endQuiz}>
              <Square className="size-3.5" />
              End
            </Button>
          </div>
        </div>
      </header>

      <section className="mx-auto grid w-full max-w-7xl gap-4 px-4 py-4 lg:grid-cols-[1fr_20rem] pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="min-h-[30rem] rounded-xl border border-surface-border bg-white p-4 md:p-5 shadow-card">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeQuestion?.id ?? "waiting"}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
            >
              {!activeQuestion ? (
                <div className="flex min-h-[25rem] flex-col items-center justify-center gap-4 text-center">
                  <RadioTower className="size-12 text-fikavo-400" />
                  <div>
                    <h2 className="text-3xl font-black text-slate-900">Room {deck?.room_code ?? "------"}</h2>
                    <p className="mt-1 text-slate-500">{status}</p>
                  </div>
                  <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-fikavo-50 px-4 py-2 text-sm font-medium text-fikavo-700">
                    <BarChart3 className="size-4" />
                    {questions.length} questions prepared
                  </div>
                </div>
              ) : showingLeaderboard ? (
                <div className="flex min-h-[30rem] flex-col items-center justify-center p-8">
                  <div className="mb-8 flex items-center gap-3">
                    <Crown className="size-10 text-amber-500" />
                    <h2 className="text-4xl font-black text-slate-900">Leaderboard</h2>
                  </div>
                  <div className="w-full max-w-2xl space-y-4">
                    {(() => {
                      const maxScore = leaderboard.length > 0 ? Math.max(leaderboard[0].points, 1) : 1;
                      return leaderboard.slice(0, 10).map((player, index) => {
                        const pct = Math.max((player.points / maxScore) * 100, 2); // At least 2% so it's slightly visible
                        return (
                          <div key={player.nickname} className="relative overflow-hidden rounded-2xl bg-slate-50 shadow-sm border border-slate-100">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={{ duration: 1, ease: "easeOut", delay: index * 0.1 }}
                              className={`absolute inset-y-0 left-0 opacity-20 ${
                                index === 0 ? "bg-amber-500" :
                                index === 1 ? "bg-slate-500" :
                                index === 2 ? "bg-orange-500" :
                                "bg-fikavo-500"
                              }`}
                            />
                            <div className="relative flex items-center justify-between p-6">
                              <div className="flex items-center gap-6">
                                <span className={`flex size-10 items-center justify-center rounded-full text-lg font-black ${
                                  index === 0 ? "bg-amber-100 text-amber-600" :
                                  index === 1 ? "bg-slate-200 text-slate-600" :
                                  index === 2 ? "bg-orange-100 text-orange-600" :
                                  "bg-slate-100 text-slate-400"
                                }`}>
                                  {index + 1}
                                </span>
                                <span className="text-2xl font-bold text-slate-800">{player.nickname}</span>
                              </div>
                              <span className="font-mono text-3xl font-black text-fikavo-600">{player.points} pts</span>
                            </div>
                          </div>
                        );
                      });
                    })()}
                    {leaderboard.length === 0 && (
                      <p className="text-center text-lg text-slate-400">No scores yet.</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Question {deck ? deck.current_slide_index + 1 : 0} of {questions.length}
                    </p>
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${
                      timeLeft <= 5 ? "bg-red-50 text-red-700 animate-pulse" : "bg-amber-50 text-amber-700"
                    }`}>
                      {timeLeft}s
                    </span>
                  </div>
                  <h2 className="text-2xl font-black leading-tight text-slate-900 md:text-3xl">
                    {activeQuestion.question_text}
                  </h2>
                  <div className="grid gap-3 md:grid-cols-2">
                    {optionVotes.map((option) => (
                      <div
                        key={option.id}
                        className="rounded-xl border p-4 transition-all border-surface-border bg-surface-muted"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-bold text-slate-800">{option.option_text}</span>
                          {showingResults && <span className="font-mono text-sm font-bold text-fikavo-600">{option.count}</span>}
                        </div>
                        {showingResults ? (
                          <>
                            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface-border">
                              <div
                                className="h-full rounded-full transition-all bg-fikavo-500"
                                style={{ width: `${option.pct}%` }}
                              />
                            </div>
                            <p className="mt-1 text-right text-xs text-slate-400">{option.pct}%</p>
                          </>
                        ) : (
                          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface-border/50" />
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="text-center text-sm text-slate-400">
                    {currentResponses.length} response{currentResponses.length !== 1 ? "s" : ""} so far
                  </p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <aside className="space-y-4">
          <div className="rounded-xl border border-surface-border bg-white p-4 shadow-card">
            <div className="mx-auto w-40">
              {joinUrl ? <QRCodeSVG value={joinUrl} className="h-auto w-full" /> : null}
            </div>
          </div>
          <div className="rounded-xl border border-surface-border bg-white p-4 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Room code</p>
            <p className="mt-1 font-mono text-3xl font-black tracking-widest text-fikavo-600">
              {deck?.room_code ?? "------"}
            </p>
          </div>
          <div className="rounded-xl border border-surface-border bg-white p-4 shadow-card">
            <div className="mb-3 flex items-center gap-2">
              {activeQuestion ? (
                <>
                  <Crown className="size-5 text-amber-500" />
                  <h2 className="text-sm font-bold text-slate-800">Leaderboard</h2>
                </>
              ) : (
                <>
                  <Users className="size-5 text-fikavo-500" />
                  <h2 className="text-sm font-bold text-slate-800">Live Participants</h2>
                </>
              )}
            </div>
            <div className="space-y-2">
              {activeQuestion ? (
                <>
                  {leaderboard.slice(0, 10).map((player, index) => (
                    <div key={player.nickname} className="flex items-center justify-between rounded-lg bg-surface-muted px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`text-xs font-bold ${
                          index === 0 ? "text-amber-500" :
                          index === 1 ? "text-slate-400" :
                          index === 2 ? "text-orange-400" :
                          "text-slate-400"
                        }`}>
                          #{index + 1}
                        </span>
                        <span className="truncate text-sm font-medium text-slate-700">{player.nickname}</span>
                      </div>
                      <span className="font-mono text-sm font-bold text-fikavo-600">{player.points}</span>
                    </div>
                  ))}
                  {leaderboard.length === 0 && (
                    <p className="text-sm text-slate-400">No answers yet.</p>
                  )}
                </>
              ) : (
                <>
                  {room.participants.slice(0, 10).map((player) => (
                    <div key={player.nickname} className="flex items-center justify-between rounded-lg bg-surface-muted px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="size-2 rounded-full bg-green-500 animate-pulse" />
                        <span className="truncate text-sm font-medium text-slate-700">{player.nickname}</span>
                      </div>
                    </div>
                  ))}
                  {room.participants.length === 0 && (
                    <p className="text-sm text-slate-400">Waiting for players...</p>
                  )}
                </>
              )}
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
