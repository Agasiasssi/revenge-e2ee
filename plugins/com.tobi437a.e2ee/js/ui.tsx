/*
 * ui.tsx — dialogs (choice + passphrase), ported from the desktop modals.
 *
 * Revenge exposes dialogs through AlertActionCreators.openAlert with Design's
 * AlertModal; an AlertActionButton press dismisses the alert itself, so the
 * promise plumbing only has to distinguish "answered" from "dismissed".
 */

import { AlertActionCreators } from "@revenge-mod/discord/actions";
import { Design } from "@revenge-mod/discord/design";
import { useState } from "react";
import type { ReactNode } from "react";
import { Text } from "react-native";

const { AlertActionButton, AlertModal, TextInput } = Design as any;

// ------------------------------ Choice alert ------------------------------

export interface Choice<T extends string> {
    id: T;
    text: string;
    variant: "secondary" | "primary" | "critical-primary";
}

export interface ChoiceOptions<T extends string> {
    title: string;
    subtitle?: ReactNode;
    /** Shown as a warning line between the subtitle and the body. */
    warning?: string;
    body?: ReactNode;
    choices: Choice<T>[];
}

/** Map the desktop modal's action variants onto RN alert button variants. */
function mapVariant(variant: Choice<never>["variant"]): string {
    switch (variant) {
        case "primary": return "primary";
        case "critical-primary": return "destructive";
        default: return "secondary";
    }
}

/**
 * Open the alert and wait for a decision. Resolves with the chosen id, or with
 * null if the alert is dismissed any other way (back press, dismissal outside
 * a button), so "no answer" can never be mistaken for one of the choices.
 */
export function askChoice<T extends string>({ title, subtitle, warning, body, choices }: ChoiceOptions<T>): Promise<T | null> {
    return new Promise(resolve => {
        let settled = false;
        const key = `com.tobi437a.e2ee.choice.${Date.now()}.${Math.floor(Math.random() * 1e6)}`;
        AlertActionCreators.openAlert(
            key,
            (
                <AlertModal
                    title={title}
                    content={subtitle}
                    extraContent={
                        <>
                            {warning ? <ChoiceWarning text={warning} /> : null}
                            {body}
                        </>
                    }
                    actions={
                        <>
                            {choices.map(({ id, text, variant }) => (
                                <AlertActionButton
                                    key={id}
                                    variant={mapVariant(variant as Choice<never>["variant"])}
                                    text={text}
                                    onPress={() => {
                                        settled = true;
                                        resolve(id);
                                    }}
                                />
                            ))}
                        </>
                    }
                />
            ),
            () => {
                if (!settled) resolve(null);
            },
        );
    });
}

function ChoiceWarning({ text }: { text: string }) {
    return (
        <WarningText>{text}</WarningText>
    );
}

// Shared minimal text styling for warning lines (no Design token typing here).
function WarningText({ children }: { children: ReactNode }) {
    return (
        <Text style={{ color: "#f23f43", fontWeight: "600", marginBottom: 8 }}>{children}</Text>
    );
}

// ------------------------------ Passphrase alert ------------------------------

/** Short passphrases are the practical break against a GPU-parallel KDF. */
export const MIN_PASSPHRASE_LENGTH = 12;

export type PassphraseMode = "create" | "unlock";

interface PassphraseAlertProps {
    mode: PassphraseMode;
    /** Resolve to an error string to keep the alert open, or null on success. */
    verify(passphrase: string): Promise<string | null>;
    onDone(passphrase: string): void;
}

function PassphraseAlert({ mode, verify, onDone }: PassphraseAlertProps) {
    const [value, setValue] = useState("");
    const [confirm, setConfirm] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const creating = mode === "create";

    function localError(): string | null {
        if (value.length < MIN_PASSPHRASE_LENGTH) {
            return `Use at least ${MIN_PASSPHRASE_LENGTH} characters.`;
        }
        if (creating && value !== confirm) return "The two passwords don't match.";
        return null;
    }

    async function submit() {
        if (busy) return;

        // In unlock mode the only local rule is "not empty" — an existing
        // passphrase that predates a stricter minimum must still work.
        const local = creating ? localError() : (value.length === 0 ? "Enter your password." : null);
        if (local) { setError(local); return; }

        setBusy(true);
        setError(null);
        try {
            const err = await verify(value);
            if (err) {
                setError(err);
                setValue("");
                setConfirm("");
                return;
            }
            onDone(value);
        } catch (e) {
            setError(String(e));
        } finally {
            setBusy(false);
        }
    }

    return (
        <AlertModal
            title={creating ? "Choose a password" : "Enter your password"}
            content={
                creating
                    ? "This password protects the encrypted messages saved on this device."
                    : "Unlock the encrypted messages saved on this device."
            }
            extraContent={
                <>
                    {creating && <WarningText>{"Write it down somewhere safe. If you forget it, every message you've sent or received with this plugin is lost for good — there is no way to reset it."}</WarningText>}
                    <TextInput
                        label="Password"
                        secureTextEntry
                        autoFocus
                        value={value}
                        onChange={setValue}
                        editable={!busy}
                        placeholder={creating ? `At least ${MIN_PASSPHRASE_LENGTH} characters` : ""}
                        status={error ? "error" : "default"}
                        errorMessage={error ?? undefined}
                    />
                    {creating && (
                        <TextInput
                            label="Type it again"
                            secureTextEntry
                            value={confirm}
                            onChange={setConfirm}
                            editable={!busy}
                            status={error ? "error" : "default"}
                        />
                    )}
                    {busy && <Text style={{ opacity: 0.7, marginTop: 6 }}>{"Checking… this takes a few seconds on purpose, to make guessing slow."}</Text>}
                </>
            }
            actions={
                <>
                    <AlertActionButton
                        variant="secondary"
                        text="Cancel"
                        onPress={() => { /* dismissal itself resolves null via onDismiss */ }}
                    />
                    <AlertActionButton
                        variant="primary"
                        text={creating ? "Set password" : "Unlock"}
                        disabled={busy}
                        onPress={() => { void submit(); }}
                    />
                </>
            }
        />
    );
}

/**
 * Open the alert and wait for a decision.
 *
 * Resolves with the passphrase once `verify` accepts it, or with null if the
 * user dismisses the alert by any route (Cancel, back press). The `settled`
 * flag is what distinguishes "closed after success" from "closed without
 * answering" — treating a successful close as a cancel would silently drop
 * the passphrase.
 */
export function askPassphrase(
    mode: PassphraseMode,
    verify: (passphrase: string) => Promise<string | null>
): Promise<string | null> {
    return new Promise(resolve => {
        let settled = false;
        const key = `com.tobi437a.e2ee.pass.${Date.now()}.${Math.floor(Math.random() * 1e6)}`;
        AlertActionCreators.openAlert(
            key,
            <PassphraseAlert
                mode={mode}
                verify={verify}
                onDone={passphrase => {
                    settled = true;
                    resolve(passphrase);
                }}
            />,
            () => {
                if (!settled) resolve(null);
            },
        );
    });
}
