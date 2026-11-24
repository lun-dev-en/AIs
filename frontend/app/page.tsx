"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, json } from "@/lib/api";
import type {
  Conditions,
  Health,
  Profile,
  Question,
  Response,
  Run,
} from "@/lib/types";
import { Avatar, Icon, themeStyle } from "@/components/icons";
import { ProfileEditor } from "@/components/editors";
import { Dialog } from "@/components/dialog";

const defaultConditions: Conditions = {
  basic: true,
  memories: true,
  thoughts: true,
  formed: true,
};
const conditionLabels: { key: keyof Conditions; title: string; sub: string }[] =
  [
    { key: "basic", title: "基本性格", sub: "生まれ持った気質" },
    { key: "memories", title: "過去の出来事", sub: "経験したこと" },
    { key: "thoughts", title: "そのときの考え", sub: "経験の受け止め方" },
    { key: "formed", title: "人格・価値観", sub: "経験から得たもの" },
  ];
const formatDate = (value: string) =>
  new Date(value).toLocaleString("ja-JP", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function Lab() {
  const [tab, setTab] = useState<"settings" | "compare">("settings");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selected, setSelected] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [health, setHealth] = useState<Health | null>(null);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(
    null,
  );
  const [question, setQuestion] = useState("");
  const [conditions, setConditions] = useState<Conditions>(defaultConditions);
  const [temperature, setTemperature] = useState<number | "">(0.7);
  const [seed, setSeed] = useState<number | "">(42);
  const [run, setRun] = useState<Run | null>(null);
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<Question[] | null>(null);
  const [historyMore, setHistoryMore] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [inspector, setInspector] = useState<Response | null>(null);
  const [pollError, setPollError] = useState("");
  const dirtyKeys = useRef(new Set<string>());
  const sendingRef = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [unsaved, setUnsaved] = useState(false);

  const dirty = useCallback((key: string, value: boolean) => {
    if (value) dirtyKeys.current.add(key);
    else dirtyKeys.current.delete(key);
    setUnsaved(dirtyKeys.current.size > 0);
  }, []);

  const notify = useCallback((text: string, error = false) => {
    setNotice({ text, error });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    if (!error) toastTimer.current = setTimeout(() => setNotice(null), 4500);
  }, []);

  const reload = useCallback(async () => {
    setProfiles(await api<Profile[]>("/personalities"));
  }, []);
  const refreshHealth = useCallback(async () => {
    try {
      const result = await api<Health>("/health");
      setHealth(result);
      return result;
    } catch (e) {
      setHealth({
        ready: false,
        model_name: "",
        active_question_id: null,
        error: (e as Error).message,
      });
      return null;
    }
  }, []);

  const initialize = useCallback(async () => {
    setLoadError("");
    try {
      await reload();
      setLoaded(true);
    } catch (e) {
      setLoadError((e as Error).message);
    }
    const status = await refreshHealth();
    if (status?.active_question_id) {
      try {
        setRun(
          await api<Run>(`/questions/${status.active_question_id}/responses`),
        );
      } catch (e) {
        notify((e as Error).message, true);
      }
    }
  }, [reload, refreshHealth, notify]);

  useEffect(() => {
    void initialize();
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [initialize]);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      if (!stopped) await refreshHealth();
      if (!stopped) timer = setTimeout(refresh, 10000);
    };
    timer = setTimeout(refresh, 10000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [refreshHealth]);
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (dirtyKeys.current.size) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);

  const runId = run?.question.question_id;
  const generating = run?.question.status === "generating";
  useEffect(() => {
    if (!runId || !generating) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await api<Run>(`/questions/${runId}/responses`);
        if (stopped) return;
        setRun(result);
        setPollError("");
        if (result.question.status === "generating")
          timer = setTimeout(poll, 1200);
        else {
          void refreshHealth();
        }
      } catch (e) {
        if (!stopped) {
          setPollError((e as Error).message);
          timer = setTimeout(poll, 4000);
        }
      }
    };
    timer = setTimeout(poll, 600);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [runId, generating, refreshHealth]);

  function guard(action: () => void) {
    if (
      dirtyKeys.current.size &&
      !window.confirm(
        "保存していない変更があります。変更を破棄して移動しますか？",
      )
    )
      return;
    action();
  }

  async function submit(e?: React.FormEvent, previous?: Question) {
    e?.preventDefault();
    if (sendingRef.current || generating || health?.active_question_id) return;
    const text = previous?.question || question.trim();
    if (!text) return;
    sendingRef.current = true;
    setSending(true);
    setNotice(null);
    try {
      const created = await api<Question>(
        "/compare",
        json("POST", {
          question: text,
          conditions: previous?.settings.conditions || conditions,
          temperature: previous?.settings.temperature ?? temperature,
          seed: previous?.settings.seed ?? seed,
          parent_question_id: previous?.question_id || null,
        }),
      );
      setRun(await api<Run>(`/questions/${created.question_id}/responses`));
    } catch (e) {
      notify((e as Error).message, true);
      const status = await refreshHealth();
      if (status?.active_question_id) {
        try {
          setRun(
            await api<Run>(`/questions/${status.active_question_id}/responses`),
          );
        } catch {
          /* The connection notice remains visible; the job stays in history. */
        }
      }
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  async function openHistory(more = false) {
    setHistoryBusy(true);
    try {
      const rows = await api<Question[]>(
        `/questions?limit=30&offset=${more ? history?.length || 0 : 0}`,
      );
      setHistory((current) => (more ? [...(current || []), ...rows] : rows));
      setHistoryMore(rows.length === 30);
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setHistoryBusy(false);
    }
  }

  async function selectHistory(item: Question) {
    try {
      setRun(await api<Run>(`/questions/${item.question_id}/responses`));
      setQuestion(item.question);
      setConditions(item.settings.conditions);
      setTemperature(item.settings.temperature);
      setSeed(item.settings.seed);
      setHistory(null);
    } catch (e) {
      notify((e as Error).message, true);
    }
  }

  const busy = sending || !!generating || !!health?.active_question_id;
  const baseline = !Object.values(conditions).some(Boolean);
  const completed =
    run?.responses.filter((r) => r.status === "complete").length || 0;

  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <a
            className="brand"
            href="/"
            onClick={(e) => {
              e.preventDefault();
              guard(() => setTab("settings"));
            }}
          >
            <span className="brand-mark">
              <i />
              <i />
              <i />
              <i />
            </span>
            <span>
              Personality<span className="brand-light"> Lab</span>
              <small>AI人格・反応比較実験室</small>
            </span>
          </a>
          <div className="header-status">
            <span className="local-badge">
              <Icon name="lock" size={14} />
              ローカル環境
            </span>
            <span className={`connection ${health?.ready ? "ready" : ""}`}>
              <i />
              {health
                ? health.ready
                  ? "Ollama 接続済み"
                  : "接続を確認"
                : "接続確認中"}
            </span>
          </div>
        </div>
      </header>
      <main className="main-shell">
        <div className="workspace-bar">
          <nav className="tabs" aria-label="メインメニュー">
            <button
              className={tab === "settings" ? "active" : ""}
              aria-current={tab === "settings" ? "page" : undefined}
              onClick={() => {
                if (tab !== "settings") setTab("settings");
              }}
            >
              <Icon name="settings" size={18} />
              人格設定
            </button>
            <button
              className={tab === "compare" ? "active" : ""}
              aria-current={tab === "compare" ? "page" : undefined}
              onClick={() => {
                if (tab !== "compare") guard(() => setTab("compare"));
              }}
            >
              <Icon name="compare" size={18} />
              反応比較{generating && <span className="tab-pulse" />}
            </button>
          </nav>
          <span className="workspace-caption">
            <Icon name="flask" size={16} />
            ひとつのモデル、4つの視点。
          </span>
        </div>
        <div className="page-heading">
          <div>
            <span className="eyebrow">
              {tab === "settings"
                ? "MEET YOUR PERSONALITIES"
                : "OBSERVE THE DIFFERENCE"}
            </span>
            <h1>
              {tab === "settings" ? (
                <>
                  人格の輪郭を、<span>つくる。</span>
                </>
              ) : (
                <>
                  同じ問いに、<span>4つの視点。</span>
                </>
              )}
            </h1>
            <p>
              {tab === "settings"
                ? "性格、記憶、価値観。それぞれの「らしさ」を自由に設定しましょう。"
                : "与える情報を変えて、反応の違いを観察しましょう。"}
            </p>
          </div>
          {tab === "settings" ? (
            <span className={`save-state ${unsaved ? "changed" : ""}`}>
              <Icon name={unsaved ? "info" : "check"} size={16} />
              {unsaved ? "未保存の変更あり" : "手動で設定・保存"}
            </span>
          ) : (
            <button
              className="button secondary"
              onClick={() => void openHistory()}
              disabled={historyBusy}
            >
              <Icon name="history" size={18} />
              実験の履歴
            </button>
          )}
        </div>
        {notice && (
          <div
            className={`notice ${notice.error ? "error" : "success"}`}
            role={notice.error ? "alert" : "status"}
          >
            <Icon name={notice.error ? "info" : "check"} size={18} />
            <span>{notice.text}</span>
            <button
              aria-label="通知を閉じる"
              className="icon-button"
              onClick={() => setNotice(null)}
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        )}
        {loadError && (
          <div className="notice error" role="alert">
            <Icon name="info" />
            <span>{loadError}</span>
            <button
              className="button secondary small"
              onClick={() => void initialize()}
            >
              再接続
            </button>
          </div>
        )}
        {!loaded && !loadError && (
          <div className="loading-page">
            <span className="spinner" />
            人格を読み込んでいます…
          </div>
        )}
        {loaded && tab === "settings" && (
          <>
            <div className="personality-grid" aria-label="編集する人格">
              {profiles.map((profile, index) => (
                <button
                  key={profile.personality_id}
                  className={`personality-card ${selected === index ? "selected" : ""}`}
                  style={themeStyle(index)}
                  aria-pressed={selected === index}
                  onClick={() => {
                    if (selected !== index) guard(() => setSelected(index));
                  }}
                >
                  <Avatar index={index} />
                  <div>
                    <h2>{profile.personality_name}</h2>
                    <p>
                      {[profile.personality1, profile.personality2]
                        .filter(Boolean)
                        .join("・")}
                    </p>
                    <span>
                      <Icon name="memory" size={13} />
                      {profile.memories.length} 件の記憶
                    </span>
                  </div>
                  <span className="selection-check">
                    {selected === index && <Icon name="check" size={13} />}
                  </span>
                </button>
              ))}
            </div>
            {profiles[selected] && (
              <ProfileEditor
                key={profiles[selected].personality_id}
                profile={profiles[selected]}
                index={selected}
                reload={reload}
                notify={notify}
                dirty={dirty}
              />
            )}
          </>
        )}
        {loaded && tab === "compare" && (
          <>
            {health && !health.ready && (
              <div className="notice warning" role="status">
                <Icon name="info" />
                <span>{health.error}</span>
                <button
                  className="button secondary small"
                  onClick={() => void refreshHealth()}
                >
                  接続を確認
                </button>
              </div>
            )}
            <form className="panel experiment-form" onSubmit={submit}>
              <div className="question-compose">
                <div className="label-heading">
                  <label htmlFor="question">4人への問いかけ</label>
                  <span className="helper">自由に、日本語で。</span>
                </div>
                <textarea
                  id="question"
                  rows={4}
                  required
                  maxLength={2000}
                  value={question}
                  disabled={busy}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="新しいことに挑戦したいけれど、失敗が怖い。どう思う？"
                />
                <div className="compose-footer">
                  <span className="helper">{question.length} / 2,000 文字</span>
                  <button
                    type="button"
                    className="text-link"
                    disabled={busy}
                    onClick={() =>
                      setQuestion(
                        "新しいことに挑戦したいけれど、失敗が怖い。どう思う？",
                      )
                    }
                  >
                    例文を使う
                  </button>
                </div>
                <button
                  className="button primary"
                  disabled={busy || !question.trim() || !health?.ready}
                  type="submit"
                >
                  {busy ? (
                    <span className="spinner" />
                  ) : (
                    <Icon name="compare" size={18} />
                  )}
                  {sending
                    ? "実験を準備中…"
                    : generating
                      ? `${completed} / 4 人の回答が完了`
                      : "4人の反応を比較する"}
                </button>
                <p className="helper centered">
                  ひとつのローカルモデルに、順番に問い合わせます。
                </p>
              </div>
              <div className="experiment-controls">
                <div className="label-heading">
                  <h2>
                    <Icon name="settings" size={17} />
                    AIに渡す情報
                  </h2>
                  <span className="tag">比較条件</span>
                </div>
                <div className="condition-grid">
                  {conditionLabels.map((item) => (
                    <label
                      key={item.key}
                      className={`condition ${conditions[item.key] ? "enabled" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={conditions[item.key]}
                        disabled={busy}
                        onChange={(e) =>
                          setConditions({
                            ...conditions,
                            [item.key]: e.target.checked,
                          })
                        }
                      />
                      <span>
                        <strong>{item.title}</strong>
                        <small>{item.sub}</small>
                      </span>
                    </label>
                  ))}
                </div>
                <p className="helper condition-help">
                  {baseline
                    ? "基準回答：名前を含むすべての人格情報を送信しません。"
                    : "チェックを外した情報は、AIに送信されません。"}
                </p>
                <div className="parameter-row">
                  <label>
                    Temperature
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="2"
                      required
                      disabled={busy}
                      value={temperature}
                      onChange={(e) =>
                        setTemperature(
                          e.target.value === "" ? "" : e.target.valueAsNumber,
                        )
                      }
                    />
                  </label>
                  <label>
                    Seed
                    <input
                      type="number"
                      step="1"
                      min="0"
                      max="2147483647"
                      required
                      disabled={busy}
                      value={seed}
                      onChange={(e) =>
                        setSeed(
                          e.target.value === "" ? "" : e.target.valueAsNumber,
                        )
                      }
                    />
                  </label>
                </div>
                <p className="helper">
                  モデル・Temperature・Seedは4人で共通です。
                </p>
              </div>
            </form>
            <div className="results-heading">
              <div>
                <h2>
                  4人の反応
                  {run && <span className="count">{completed} / 4</span>}
                </h2>
                <p>
                  {run
                    ? `実験 #${run.question.question_id} · ${formatDate(run.question.created_at)} · ${run.question.settings.model_name}`
                    : "同じ問いかけへの、異なる受け止め方。"}
                </p>
              </div>
              {run && (
                <button
                  className="button secondary small"
                  disabled={busy || !health?.ready}
                  onClick={() => void submit(undefined, run.question)}
                >
                  <Icon name="refresh" size={16} />
                  同じ条件で再生成
                </button>
              )}
            </div>
            {run && (
              <div className="run-question">
                <Icon name="compare" size={18} />
                <div>
                  <strong>{run.question.question}</strong>
                  <span>
                    {conditionLabels
                      .filter((c) => run.question.settings.conditions[c.key])
                      .map((c) => c.title)
                      .join(" ＋ ") || "人格情報なし（基準回答）"}{" "}
                    · Temperature {run.question.settings.temperature} · Seed{" "}
                    {run.question.settings.seed}
                  </span>
                </div>
              </div>
            )}
            {run && (
              <p className="helper regeneration-note">
                再生成は現在の人格設定・モデルを使用し、新しい実験として保存します。過去の結果は残ります。
                {health?.model_name &&
                  run.question.settings.model_name !== health.model_name &&
                  " 現在のモデルは過去の実験と異なります。"}
              </p>
            )}
            {pollError && (
              <div className="notice warning" role="alert">
                <Icon name="info" />
                <span>{pollError} 自動で再接続しています。</span>
              </div>
            )}
            {run?.question.error && (
              <div className="notice error" role="alert">
                <Icon name="info" />
                <span>{run.question.error}</span>
              </div>
            )}
            <div className="response-grid">
              {profiles.map((profile, index) => {
                const result = run?.responses.find(
                  (r) => r.personality_id === profile.personality_id,
                );
                const persona = result?.metadata.personality || profile;
                return (
                  <article
                    className="panel response-card"
                    key={profile.personality_id}
                    style={themeStyle(index)}
                  >
                    <div className="response-person">
                      <Avatar index={index} size={56} />
                      <div>
                        <h3>{persona.personality_name}</h3>
                        <p>
                          {[persona.personality1, persona.personality2]
                            .filter(Boolean)
                            .join("・")}
                        </p>
                      </div>
                      <span
                        className={`response-state ${result?.status || ""}`}
                      >
                        {!result
                          ? "準備完了"
                          : {
                              pending: "順番待ち",
                              generating: "生成中",
                              complete: "回答完了",
                              error: "生成エラー",
                            }[result.status]}
                      </span>
                    </div>
                    <div
                      className={`speech ${!result ? "empty" : ""}`}
                      aria-live="polite"
                    >
                      {!result ? (
                        <>
                          <Icon name="compare" size={24} />
                          <p>
                            問いかけを待っています。
                            <br />
                            <span>この人格なら、どう答えるでしょう。</span>
                          </p>
                        </>
                      ) : result.status === "generating" ? (
                        <div className="answer-loading">
                          <span className="thinking-dots">
                            <i />
                            <i />
                            <i />
                          </span>
                          <p>この人格の視点で、回答を生成しています。</p>
                        </div>
                      ) : result.status === "pending" ? (
                        <p className="helper">
                          ほかの回答が終わるまで待機しています。
                        </p>
                      ) : result.status === "error" ? (
                        <p className="answer-error">{result.error}</p>
                      ) : (
                        <p className="answer-text">{result.response}</p>
                      )}
                    </div>
                    <div className="response-footer">
                      {result ? (
                        <>
                          <span className="helper">
                            {result.metadata.omitted_memory_ids.length
                              ? `記憶 ${result.metadata.omitted_memory_ids.length} 件を省略`
                              : `${result.metadata.included_memory_ids.length} 件の記憶を使用`}
                          </span>
                          <button
                            className="text-link"
                            onClick={() => setInspector(result)}
                          >
                            <Icon name="info" size={15} />
                            使用した情報を見る
                          </button>
                        </>
                      ) : (
                        <span className="helper">
                          回答は人格ごとに独立して生成されます。
                        </span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
        <footer className="page-footer">
          <span>
            <Icon name="lock" size={14} />
            あなたの端末だけで、考える実験。
          </span>
          <span>
            {health?.model_name || "Ollama"} <b>·</b> SQLite <b>·</b> 外部AI API
            不使用
          </span>
        </footer>
      </main>
      {inspector && (
        <Dialog title="AIに送信した情報" close={() => setInspector(null)} wide>
          <div className="inspector-summary">
            <span className="tag">{inspector.model_name}</span>
            <span>Temperature {inspector.temperature}</span>
            <span>Seed {inspector.seed}</span>
            <span>Context {inspector.metadata.num_ctx}</span>
          </div>
          <p className="helper">
            生成時点の情報を保存しています。現在の人格設定を編集しても、この記録は変わりません。
          </p>
          {inspector.metadata.omitted_memory_ids.length > 0 && (
            <p className="omission-warning">
              コンテキスト長のため省略した記憶ID：
              {inspector.metadata.omitted_memory_ids.join(", ")}
            </p>
          )}
          <details>
            <summary>実際に使用した人格データ</summary>
            <pre>
              {JSON.stringify(inspector.metadata.used_information, null, 2)}
            </pre>
          </details>
          {inspector.messages.map((message, index) => (
            <section className="prompt-section" key={index}>
              <h3>
                {message.role === "system"
                  ? "システムプロンプト"
                  : "ユーザーメッセージ"}
              </h3>
              <pre>{message.content}</pre>
            </section>
          ))}
        </Dialog>
      )}
      {history !== null && (
        <Dialog title="実験の履歴" close={() => setHistory(null)}>
          <p className="helper">
            過去の問いかけ、4人の回答、送信した情報を確認できます。
          </p>
          {history.length === 0 ? (
            <div className="history-empty">
              <Icon name="history" size={36} />
              <h3>実験はこれからです</h3>
              <p>最初の問いかけを送ると、ここに記録されます。</p>
            </div>
          ) : (
            <div className="history-list">
              {history.map((item) => (
                <button
                  key={item.question_id}
                  onClick={() => void selectHistory(item)}
                >
                  <div>
                    <span>
                      実験 #{item.question_id} · {formatDate(item.created_at)}
                    </span>
                    <span className="tag">
                      {
                        {
                          generating: "生成中",
                          complete: "完了",
                          partial: "一部エラー",
                          failed: "エラー",
                        }[item.status]
                      }
                    </span>
                  </div>
                  <strong>{item.question}</strong>
                  <small>
                    {item.settings.model_name} · Seed {item.settings.seed}
                    {item.parent_question_id
                      ? ` · #${item.parent_question_id} から再生成`
                      : ""}
                  </small>
                </button>
              ))}
            </div>
          )}
          {historyMore && (
            <button
              className="button secondary full"
              disabled={historyBusy}
              onClick={() => void openHistory(true)}
            >
              さらに読み込む
            </button>
          )}
        </Dialog>
      )}
    </>
  );
}
