/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./settings.css";

import { BaseText } from "@components/BaseText";
import { Divider } from "@components/Divider";
import { Heading } from "@components/Heading";
import { resolveError } from "@components/settings/tabs/plugins/components/Common";
import { classNameFactory } from "@utils/css";
import { ActivityType } from "@vencord/discord-types/enums";
import { Select, TextInput, useEffect, useState } from "@webpack/common";

import { RpcPreset, settings, switchPreset, TimestampMode, updatePresetValue } from ".";

const cl = classNameFactory("vc-customRPC-settings-");

const makeValidator = (maxLength: number, isRequired = false) => (value: string | undefined) => {
    if (isRequired && !value) return "This field is required.";
    if (value && value.length > maxLength) return `Must be not longer than ${maxLength} characters.`;
    return true;
};

const maxLength128 = makeValidator(128);

function isAppIdValid(value: string | undefined) {
    if (!value) return true;
    if (!/^\d{16,21}$/.test(value)) return "Must be a valid Discord ID.";
    return true;
}

interface SelectOption<T> {
    settingsKey: keyof RpcPreset;
    label: string;
    disabled?: boolean;
    options: { label: string; value: T; default?: boolean; }[];
    preset: RpcPreset;
}

function isStreamLinkValid(value: string | undefined, isDisabled: boolean) {
    if (isDisabled || !value) return true;
    if (!/https?:\/\/(www\.)?(twitch\.tv|youtube\.com)\/\w+/.test(value)) return "Streaming link must be a valid URL.";
    if (value.length > 512) return "Streaming link must be not longer than 512 characters.";
    return true;
}

function parseNumber(value: string) {
    return value ? parseInt(value, 10) : 0;
}

function isNumberValid(value: number | undefined) {
    if (value === undefined) return true;
    if (isNaN(value)) return "Must be a number.";
    if (value < 0) return "Must be a positive number.";
    return true;
}

function isUrlValid(value: string | undefined) {
    if (value && !/^https?:\/\/.+/.test(value)) return "Must be a valid URL.";
    return true;
}

function isImageKeyValid(value: string | undefined) {
    if (!value) return true;
    if (/https?:\/\/(cdn|media)\.discordapp\.(com|net)\//.test(value)) return "Don't use a Discord link. Use an Imgur image link instead.";
    if (/https?:\/\/(?!i\.)?imgur\.com\//.test(value)) return "Imgur link must be a direct link to the image (e.g. https://i.imgur.com/...). Right click the image and click 'Copy image address'";
    if (/https?:\/\/(?!media\.)?tenor\.com\//.test(value)) return "Tenor link must be a direct link to the image (e.g. https://media.tenor.com/...). Right click the GIF and click 'Copy image address'";
    return true;
}

function PairSetting<K1 extends keyof RpcPreset, K2 extends keyof RpcPreset>({ data, preset, activePreset }: { data: [TextOption<K1>, TextOption<K2>]; preset: RpcPreset; activePreset: number; }) {
    const [left, right] = data;

    return (
        <div className={cl("pair")}>
            <SingleSetting {...left} preset={preset} activePreset={activePreset} />
            <SingleSetting {...right} preset={preset} activePreset={activePreset} />
        </div>
    );
}

interface TextOption<K extends keyof RpcPreset> {
    settingsKey: K;
    label: string;
    disabled?: boolean;
    transform?: (value: string) => RpcPreset[K];
    isValid?: (value: RpcPreset[K]) => true | string;
}

type SingleSettingProps<K extends keyof RpcPreset> = TextOption<K> & {
    preset: RpcPreset;
    activePreset: number;
};

function SingleSetting<K extends keyof RpcPreset>({ settingsKey, label, disabled, isValid, transform, preset, activePreset }: SingleSettingProps<K>) {
    const value = preset[settingsKey];
    const [localValue, setLocalValue] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setLocalValue(null);
        setError(null);
    }, [activePreset]);

    const displayValue = localValue !== null ? localValue : (value ?? "");

    function handleChange(newValue: string) {
        const transformed = (transform ? transform(newValue) : newValue) as RpcPreset[K];

        setLocalValue(newValue);
        const valid = isValid?.(transformed) ?? true;
        setError(resolveError(valid));

        if (valid === true) {
            updatePresetValue(settingsKey, transformed);
        }
    }

    return (
        <div className={cl("single", { disabled })}>
            <Heading tag="h5">{label}</Heading>
            <TextInput
                type="text"
                placeholder="Enter a value"
                value={String(displayValue)}
                onChange={handleChange}
                disabled={disabled}
            />
            {error && <BaseText size="sm" weight="normal" color="text-feedback-critical">{error}</BaseText>}
        </div>
    );
}

function SelectSetting<T>({ settingsKey, label, options, disabled, preset }: SelectOption<T>) {
    const defaultOption = options.find(o => o.default)?.value;
    const value = preset[settingsKey] ?? defaultOption;

    return (
        <div className={cl("single", { disabled })}>
            <Heading tag="h5">{label}</Heading>
            <Select
                placeholder={"Select an option"}
                options={options}
                maxVisibleItems={5}
                closeOnSelect={true}
                select={v => updatePresetValue(settingsKey, v as any)}
                isSelected={v => v === value}
                serialize={v => String(v)}
                isDisabled={disabled}
            />
        </div>
    );
}

export function RPCSettings() {
    const s = settings.use();
    const activePreset = s.activePreset ?? 0;
    const preset = s.presets?.[activePreset] ?? s;
    const isStreamLinkDisabled = preset.type !== ActivityType.STREAMING;

    return (
        <div className={cl("root")}>
            <div className={cl("single")}>
                <Heading tag="h5">Active Preset</Heading>
                <Select
                    placeholder="Select a preset"
                    options={[
                        { label: "Preset 1", value: 0 },
                        { label: "Preset 2", value: 1 },
                        { label: "Preset 3", value: 2 },
                    ]}
                    closeOnSelect={true}
                    select={v => switchPreset(v as number)}
                    isSelected={v => v === activePreset}
                    serialize={v => String(v)}
                />
            </div>

            <Divider />

            <SelectSetting
                preset={preset}
                settingsKey="type"
                label="Activity Type"
                options={[
                    {
                        label: "Playing",
                        value: ActivityType.PLAYING,
                        default: true
                    },
                    {
                        label: "Streaming",
                        value: ActivityType.STREAMING
                    },
                    {
                        label: "Listening",
                        value: ActivityType.LISTENING
                    },
                    {
                        label: "Watching",
                        value: ActivityType.WATCHING
                    },
                    {
                        label: "Competing",
                        value: ActivityType.COMPETING
                    }
                ]}
            />

            <PairSetting data={[
                { settingsKey: "appID", label: "Application ID", isValid: isAppIdValid },
                { settingsKey: "appName", label: "Application Name", isValid: makeValidator(128, true) },
            ]}
                preset={preset}
                activePreset={activePreset}
            />

            <PairSetting data={[
                { settingsKey: "details", label: "Detail (line 1)", isValid: maxLength128 },
                { settingsKey: "detailsURL", label: "Detail URL", isValid: isUrlValid },
            ]}
                preset={preset}
                activePreset={activePreset}
            />

            <PairSetting data={[
                { settingsKey: "state", label: "State (line 2)", isValid: maxLength128 },
                { settingsKey: "stateURL", label: "State URL", isValid: isUrlValid },
            ]}
                preset={preset}
                activePreset={activePreset}
            />

            <SingleSetting
                preset={preset} activePreset={activePreset}
                settingsKey="streamLink"
                label="Stream Link (Twitch or YouTube, only if activity type is Streaming)"
                disabled={isStreamLinkDisabled}
                isValid={v => isStreamLinkValid(v, isStreamLinkDisabled)}
            />

            <PairSetting data={[
                {
                    settingsKey: "partySize",
                    label: "Party Size",
                    transform: parseNumber,
                    isValid: isNumberValid,
                    disabled: preset.type !== ActivityType.PLAYING,
                },
                {
                    settingsKey: "partyMaxSize",
                    label: "Maximum Party Size",
                    transform: parseNumber,
                    isValid: isNumberValid,
                    disabled: preset.type !== ActivityType.PLAYING,
                },
            ]}
                preset={preset}
                activePreset={activePreset}
            />

            <Divider />

            <PairSetting data={[
                { settingsKey: "imageBig", label: "Large Image URL/Key", isValid: isImageKeyValid },
                { settingsKey: "imageBigTooltip", label: "Large Image Text", isValid: maxLength128 },
            ]}
                preset={preset}
                activePreset={activePreset}
            />
            <SingleSetting preset={preset} activePreset={activePreset} settingsKey="imageBigURL" label="Large Image clickable URL" isValid={isUrlValid} />

            <PairSetting data={[
                { settingsKey: "imageSmall", label: "Small Image URL/Key", isValid: isImageKeyValid },
                { settingsKey: "imageSmallTooltip", label: "Small Image Text", isValid: maxLength128 },
            ]}
                preset={preset}
                activePreset={activePreset}
            />
            <SingleSetting preset={preset} activePreset={activePreset} settingsKey="imageSmallURL" label="Small Image clickable URL" isValid={isUrlValid} />

            <Divider />

            <PairSetting data={[
                { settingsKey: "buttonOneText", label: "Button1 Text", isValid: makeValidator(31) },
                { settingsKey: "buttonOneURL", label: "Button1 URL", isValid: isUrlValid },
            ]} preset={preset} activePreset={activePreset} />
            <PairSetting data={[
                { settingsKey: "buttonTwoText", label: "Button2 Text", isValid: makeValidator(31) },
                { settingsKey: "buttonTwoURL", label: "Button2 URL", isValid: isUrlValid },
            ]} preset={preset} activePreset={activePreset} />

            <Divider />

            <SelectSetting
                preset={preset}
                settingsKey="timestampMode"
                label="Timestamp Mode"
                options={[
                    {
                        label: "None",
                        value: TimestampMode.NONE,
                        default: true
                    },
                    {
                        label: "Since discord open",
                        value: TimestampMode.NOW
                    },
                    {
                        label: "Same as your current time (not reset after 24h)",
                        value: TimestampMode.TIME
                    },
                    {
                        label: "Custom",
                        value: TimestampMode.CUSTOM
                    }
                ]}
            />

            <PairSetting data={[
                {
                    settingsKey: "startTime",
                    label: "Start Timestamp (in milliseconds)",
                    transform: parseNumber,
                    isValid: isNumberValid,
                    disabled: preset.timestampMode !== TimestampMode.CUSTOM,
                },
                {
                    settingsKey: "endTime",
                    label: "End Timestamp (in milliseconds)",
                    transform: parseNumber,
                    isValid: isNumberValid,
                    disabled: preset.timestampMode !== TimestampMode.CUSTOM,
                },
            ]} preset={preset} activePreset={activePreset} />
        </div>
    );
}
