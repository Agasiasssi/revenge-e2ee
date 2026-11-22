/*
 * ui.tsx — dialogs (choice + passphrase), built from Discord's own Design
 * components found through bunny.metro. No JSX: bundles have no React import,
 * so elements are created with React.createElement (aliased to `h`).
 *
 * AlertActionCreators-style alerts close themselves when an AlertActionButton
 * is pressed, so the promise plumbing only has to distinguish "answered" from
 * "dismissed".
 */

import { alerts, C, h, React, RN } from "./ctx";

// ------------------------------ Choice alert ------------------------------

export interface Choice<T extends string> {
    id: T;
    text: string;
    variant: "secondary" | "primary" | "critical-primary";
}

export interface ChoiceOptions<T extends string> {
    title: string;
    subtitle?: string;
    /** Shown as a warning line between the subtitle and the body. */
    warning?: string;
    body?: any;
    choices: Choice<T>[];
}

function mapVariant(variant: Choice<never>["variant"]): string {
    switch (variant) {
        case "primary": return "primary";
        case "critical-primary": return "destructive";
        default: return "secondary";
    }
}

let alertSeq = 0;
function nextKey(kind: string): string {
    return `com.tobi437a.e2ee.${kind}.${Date.now()}.${alertSeq++}`;
}

export function askChoice<T extends string>({ title, subtitle, warning, body, choices }: ChoiceOptions<T>): Promise<T | null> {
    return new Promise(resolve => {
        let settled = false;
        const key = nextKey("choice");
        alerts.openAlert(
            key,
            h(C.AlertModal, {
                title,
                content: subtitle,
                extraContent: h(React.Fragment, null,
                    warning ? h(RN.Text, { style: { color: "#f23f43", fontWeight: "600", marginBottom: 8 } }, warning) : null,
                    body ?? null,
                ),
                actions: h(React.Fragment, null,
                    choices.map(({ id, text, variant }) =>
                        h(C.AlertActionButton, {
                            key: id,
                            variant: mapVariant(variant),
                            text,
                            onPress: () => {
                                settled = true;
                                resolve(id);
                            },
                        })),
                ),
            }),
            () => {
                if (!settled) resolve(null);
            },
        );
    });
}

// ------------------------------ Passphrase alert ------------------------------

/** Short passphrases are the practical break against a GPU-parallel KDF. */
export const MIN_PASSPHRASE_LENGTH = 12;

export type PassphraseMode = "create" | "unlock";

export function askPassphrase(
    mode: PassphraseMode,
    verify: (passphrase: string) => Promise<string | null>
): Promise<string | null> {
    return new Promise(resolve => {
        let settled = false;
        const key = nextKey("pass");

        const PassphraseAlert = (props: { onDone(pass: string): void; }) => {
            const [value, setValue] = React.useState("");
            const [confirm, setConfirm] = React.useState("");
            const [error, setError] = React.useState<string | null>(null);
            const [busy, setBusy] = React.useState(false);

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
                    props.onDone(value);
                } catch (e) {
                    setError(String(e));
                } finally {
                    setBusy(false);
                }
            }

            return h(C.AlertModal, {
                title: creating ? "Choose a password" : "Enter your password",
                content: creating
                    ? "This password protects the encrypted messages saved on this device."
                    : "Unlock the encrypted messages saved on this device.",
                extraContent: h(React.Fragment, null,
                    creating ? h(RN.Text, { style: { color: "#f23f43", fontWeight: "600", marginBottom: 8 } },
                        "Write it down somewhere safe. If you forget it, every message you've sent or received with this plugin is lost for good — there is no way to reset it.") : null,
                    h(C.TextInput, {
                        label: "Password",
                        secureTextEntry: true,
                        autoFocus: true,
                        value,
                        onChange: setValue,
                        isDisabled: busy,
                        placeholder: creating ? `At least ${MIN_PASSPHRASE_LENGTH} characters` : "",
                        status: error ? "error" : "default",
                        errorMessage: error ?? undefined,
                    }),
                    creating ? h(C.TextInput, {
                        label: "Type it again",
                        secureTextEntry: true,
                        value: confirm,
                        onChange: setConfirm,
                        isDisabled: busy,
                        status: error ? "error" : "default",
                    }) : null,
                    busy ? h(RN.Text, { style: { opacity: 0.7, marginTop: 6 } },
                        "Checking… this takes a few seconds on purpose, to make guessing slow.") : null,
                ),
                actions: h(React.Fragment, null,
                    h(C.AlertActionButton, { variant: "secondary", text: "Cancel" }),
                    h(C.AlertActionButton, {
                        variant: "primary",
                        text: creating ? "Set password" : "Unlock",
                        disabled: busy,
                        onPress: () => { void submit(); },
                    }),
                ),
            });
        };

        alerts.openAlert(
            key,
            h(PassphraseAlert, {
                onDone: (passphrase: string) => {
                    settled = true;
                    resolve(passphrase);
                },
            }),
            () => {
                if (!settled) resolve(null);
            },
        );
    });
}
