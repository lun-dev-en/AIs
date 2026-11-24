"use client";

import { useEffect, useState } from "react";
import { api, json } from "@/lib/api";
import type { Formed, Memory, Profile } from "@/lib/types";
import { Avatar, Icon, themeStyle } from "./icons";

type Shared = {
  reload: () => Promise<void>;
  notify: (message: string, error?: boolean) => void;
  dirty: (key: string, value: boolean) => void;
};

function useDirty(key: string, value: boolean, callback: Shared["dirty"]) {
  useEffect(() => {
    callback(key, value);
    return () => callback(key, false);
  }, [key, value, callback]);
}

export function ProfileEditor({
  profile,
  index,
  ...shared
}: Shared & { profile: Profile; index: number }) {
  const [name, setName] = useState(profile.personality_name);
  const [trait1, setTrait1] = useState(profile.personality1);
  const [trait2, setTrait2] = useState(profile.personality2 || "");
  const [base, setBase] = useState([name, trait1, trait2]);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const changed =
    JSON.stringify([name, trait1, trait2]) !== JSON.stringify(base);
  useDirty("profile", changed, shared.dirty);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(
        `/personalities/${profile.personality_id}`,
        json("PUT", {
          personality_name: name,
          personality1: trait1,
          personality2: trait2 || null,
        }),
      );
      setBase([name, trait1, trait2]);
      await shared.reload();
      shared.notify("基本設定を保存しました。");
    } catch (e) {
      shared.notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="editor-layout" style={themeStyle(index)}>
      <section className="panel basic-panel">
        <div className="editor-avatar">
          <Avatar index={index} size={92} />
          <span className="eyebrow">PERSONALITY PROFILE</span>
          <h2>{profile.personality_name}の基本設定</h2>
          <p>この人格の、変わらない出発点。</p>
        </div>
        <form onSubmit={save} className="field-stack">
          <label>
            名前 <span className="required">必須</span>
            <input
              value={name}
              maxLength={80}
              required
              onChange={(e) => setName(e.target.value)}
              placeholder="人格の名前"
            />
          </label>
          <label>
            基本性格 1 <span className="required">必須</span>
            <textarea
              rows={2}
              value={trait1}
              maxLength={500}
              required
              onChange={(e) => setTrait1(e.target.value)}
              placeholder="例：明るい、前向き"
            />
          </label>
          <label>
            基本性格 2 <span className="optional">任意</span>
            <textarea
              rows={2}
              value={trait2}
              maxLength={500}
              onChange={(e) => setTrait2(e.target.value)}
              placeholder="例：好奇心旺盛"
            />
          </label>
          <button
            className="button person-button"
            disabled={busy || !changed}
            type="submit"
          >
            <Icon name="save" size={17} />
            {busy ? "保存中…" : "基本設定を保存"}
          </button>
          <p className="helper centered">
            {changed
              ? "未保存の変更があります"
              : "設定はこの端末のSQLiteに保存されます"}
          </p>
        </form>
      </section>
      <section className="memory-section">
        <div className="section-heading">
          <div>
            <h2>
              <Icon name="memory" />
              過去の記憶<span className="count">{profile.memories.length}</span>
            </h2>
            <p>出来事とその解釈から、人格の奥行きをつくります。</p>
          </div>
          <button
            className="button secondary small"
            disabled={adding}
            onClick={() => setAdding(true)}
          >
            <Icon name="plus" size={17} />
            記憶を追加
          </button>
        </div>
        {adding && (
          <MemoryEditor
            {...shared}
            personalityId={profile.personality_id}
            onCreated={() => setAdding(false)}
            onCancel={() => setAdding(false)}
          />
        )}
        {!profile.memories.length && !adding && (
          <div className="empty-memories panel">
            <div className="memory-illustration">
              <span />
              <span />
              <Icon name="memory" size={38} />
              <i>
                <Icon name="plus" size={16} />
              </i>
            </div>
            <h3>まだ、記憶はありません</h3>
            <p>
              うれしかったこと、失敗したこと。
              <br />
              一つの経験が、新しい価値観につながります。
            </p>
            <button
              className="button secondary"
              onClick={() => setAdding(true)}
            >
              <Icon name="plus" size={17} />
              最初の記憶を追加
            </button>
            <span className="helper">
              記憶や価値観は、すべて手動で設定します。
            </span>
          </div>
        )}
        <div className="memory-list">
          {profile.memories.map((memory) => (
            <MemoryEditor
              key={memory.memory_id}
              memory={memory}
              personalityId={profile.personality_id}
              {...shared}
            />
          ))}
        </div>
        <div className="note">
          <Icon name="info" size={18} />
          <p>
            AIが人格や記憶を書き換えることはありません。問いかけや回答も、自動で記憶に追加されません。
          </p>
        </div>
      </section>
    </div>
  );
}

function MemoryEditor({
  memory,
  personalityId,
  onCreated,
  onCancel,
  ...shared
}: Shared & {
  memory?: Memory;
  personalityId: number;
  onCreated?: () => void;
  onCancel?: () => void;
}) {
  const [event, setEvent] = useState(memory?.past_memory || "");
  const [thought, setThought] = useState(memory?.think || "");
  const [base, setBase] = useState([event, thought]);
  const [busy, setBusy] = useState(false);
  const changed = JSON.stringify([event, thought]) !== JSON.stringify(base);
  useDirty(`memory-${memory?.memory_id || "new"}`, changed, shared.dirty);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(
        memory
          ? `/memories/${memory.memory_id}`
          : `/personalities/${personalityId}/memories`,
        json(memory ? "PUT" : "POST", { past_memory: event, think: thought }),
      );
      setBase([event, thought]);
      await shared.reload();
      shared.notify("記憶を保存しました。");
      onCreated?.();
    } catch (e) {
      shared.notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("この記憶と、関連するすべての価値観を削除しますか？"))
      return;
    setBusy(true);
    try {
      await api(`/memories/${memory!.memory_id}`, { method: "DELETE" });
      await shared.reload();
      shared.notify("記憶を削除しました。");
    } catch (e) {
      shared.notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="panel memory-card">
      <div className="memory-card-heading">
        <span>
          <Icon name="memory" size={17} />
          {memory ? "経験の記録" : "新しい記憶"}
        </span>
        {memory && (
          <button
            className="icon-button danger"
            aria-label="この記憶を削除"
            disabled={busy}
            onClick={remove}
          >
            <Icon name="trash" size={17} />
          </button>
        )}
      </div>
      <form onSubmit={save} className="field-stack">
        <label>
          過去の出来事
          <textarea
            rows={3}
            required
            maxLength={10000}
            value={event}
            onChange={(e) => setEvent(e.target.value)}
            placeholder="例：初めての発表で失敗したが、友人が励ましてくれた。"
          />
        </label>
        <label>
          そのときに考えたこと
          <textarea
            rows={2}
            required
            maxLength={10000}
            value={thought}
            onChange={(e) => setThought(e.target.value)}
            placeholder="例：失敗しても、支えてくれる人がいる。"
          />
        </label>
        <div className="form-actions">
          {onCancel && (
            <button
              type="button"
              className="button text-button small"
              disabled={busy}
              onClick={onCancel}
            >
              キャンセル
            </button>
          )}
          <button
            className="button secondary small"
            disabled={
              busy || (memory && !changed) || !event.trim() || !thought.trim()
            }
            type="submit"
          >
            <Icon name="save" size={16} />
            {busy ? "保存中…" : "記憶を保存"}
          </button>
        </div>
      </form>
      {memory && (
        <div className="formed-section">
          <h3>
            <Icon name="spark" size={16} />
            形成された人格・価値観
          </h3>
          <p className="helper">この出来事が、今の自分に与えたもの。</p>
          {memory.formed_personalities.map((value) => (
            <FormedEditor
              key={value.formed_id}
              value={value}
              memoryId={memory.memory_id}
              {...shared}
            />
          ))}
          <FormedEditor
            key={`new-${memory.formed_personalities.length}`}
            memoryId={memory.memory_id}
            {...shared}
          />
        </div>
      )}
      {!memory && (
        <p className="helper">
          記憶を保存すると、この出来事から形成された価値観を追加できます。
        </p>
      )}
    </article>
  );
}

function FormedEditor({
  value,
  memoryId,
  ...shared
}: Shared & { value?: Formed; memoryId: number }) {
  const [text, setText] = useState(value?.formed_personality || "");
  const [base, setBase] = useState(text);
  const [busy, setBusy] = useState(false);
  useDirty(
    `formed-${value?.formed_id || `new-${memoryId}`}`,
    text !== base,
    shared.dirty,
  );

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(
        value
          ? `/formed-personalities/${value.formed_id}`
          : `/memories/${memoryId}/formed-personalities`,
        json(value ? "PUT" : "POST", { formed_personality: text }),
      );
      setBase(text);
      await shared.reload();
      shared.notify("価値観を保存しました。");
    } catch (e) {
      shared.notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("この価値観を削除しますか？")) return;
    setBusy(true);
    try {
      await api(`/formed-personalities/${value!.formed_id}`, {
        method: "DELETE",
      });
      await shared.reload();
      shared.notify("価値観を削除しました。");
    } catch (e) {
      shared.notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="formed-row" onSubmit={save}>
      <textarea
        aria-label={value ? "価値観を編集" : "新しい価値観"}
        rows={2}
        maxLength={10000}
        required
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="例：結果だけでなく、挑戦する姿勢を大切にする。"
      />
      <button
        type="submit"
        className="icon-button"
        disabled={busy || text === base || !text.trim()}
        aria-label={value ? "価値観を保存" : "価値観を追加"}
      >
        <Icon name={value ? "save" : "plus"} size={18} />
      </button>
      {value && (
        <button
          type="button"
          className="icon-button danger"
          aria-label="価値観を削除"
          disabled={busy}
          onClick={remove}
        >
          <Icon name="trash" size={17} />
        </button>
      )}
    </form>
  );
}
