/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { isPluginEnabled } from "@api/PluginManager";
import { definePluginSettings } from "@api/Settings";
import { getUserSettingLazy } from "@api/UserSettings";
import { Button } from "@components/Button";
import { Divider } from "@components/Divider";
import { ErrorCard } from "@components/ErrorCard";
import { Flex } from "@components/Flex";
import { Heading } from "@components/Heading";
import { Link } from "@components/Link";
import { Paragraph } from "@components/Paragraph";
import { debounce } from "@shared/debounce";
import { Devs } from "@utils/constants";
import { isTruthy } from "@utils/guards";
import { Margins } from "@utils/margins";
import { classes } from "@utils/misc";
import { useAwaiter } from "@utils/react";
import definePlugin, { OptionType } from "@utils/types";
import { Activity } from "@vencord/discord-types";
import { ActivityType } from "@vencord/discord-types/enums";
import { findByCodeLazy, findComponentByCodeLazy } from "@webpack";
import { ApplicationAssetUtils, FluxDispatcher, UserStore } from "@webpack/common";

import { RPCSettings } from "./RpcSettings";

export const MAX_PRESETS = 3;

const useProfileThemeStyle = findByCodeLazy("profileThemeStyle:", "--profile-gradient-primary-color");
const ActivityView = findComponentByCodeLazy(".party?(0", "USER_PROFILE_ACTIVITY");

const ShowCurrentGame = getUserSettingLazy<boolean>("status", "showCurrentGame")!;

async function getApplicationAsset(key: string): Promise<string> {
    return (await ApplicationAssetUtils.fetchAssetIds(getActivePreset().appID!, [key]))[0];
}

export const enum TimestampMode {
    NONE,
    NOW,
    TIME,
    CUSTOM,
}

export interface RpcPreset {
    appID?: string;
    appName?: string;
    details?: string;
    detailsURL?: string;
    state?: string;
    stateURL?: string;
    type?: ActivityType;
    streamLink?: string;
    timestampMode?: TimestampMode;
    startTime?: number;
    endTime?: number;
    imageBig?: string;
    imageBigURL?: string;
    imageBigTooltip?: string;
    imageSmall?: string;
    imageSmallURL?: string;
    imageSmallTooltip?: string;
    buttonOneText?: string;
    buttonOneURL?: string;
    buttonTwoText?: string;
    buttonTwoURL?: string;
    partySize?: number;
    partyMaxSize?: number;
}

export const settings = definePluginSettings({
    config: {
        type: OptionType.COMPONENT,
        component: RPCSettings
    },
}).withPrivateSettings<RpcPreset & {
    activePreset?: number;
    presets?: RpcPreset[];
}>();

export function ensurePresets() {
    const s = settings.store;
    if (!Array.isArray(s.presets)) {
        s.presets = [
            {
                appID: s.appID,
                appName: s.appName,
                details: s.details,
                detailsURL: s.detailsURL,
                state: s.state,
                stateURL: s.stateURL,
                type: s.type,
                streamLink: s.streamLink,
                timestampMode: s.timestampMode,
                startTime: s.startTime,
                endTime: s.endTime,
                imageBig: s.imageBig,
                imageBigURL: s.imageBigURL,
                imageBigTooltip: s.imageBigTooltip,
                imageSmall: s.imageSmall,
                imageSmallURL: s.imageSmallURL,
                imageSmallTooltip: s.imageSmallTooltip,
                buttonOneText: s.buttonOneText,
                buttonOneURL: s.buttonOneURL,
                buttonTwoText: s.buttonTwoText,
                buttonTwoURL: s.buttonTwoURL,
                partySize: s.partySize,
                partyMaxSize: s.partyMaxSize,
            },
            {},
            {}
        ];

        const legacyKeys: (keyof RpcPreset)[] = ["appID", "appName", "details", "detailsURL", "state", "stateURL", "type", "streamLink", "timestampMode", "startTime", "endTime", "imageBig", "imageBigURL", "imageBigTooltip", "imageSmall", "imageSmallURL", "imageSmallTooltip", "buttonOneText", "buttonOneURL", "buttonTwoText", "buttonTwoURL", "partySize", "partyMaxSize"];
        for (const key of legacyKeys) delete s[key];
    }

    while (s.presets.length < MAX_PRESETS) {
        s.presets.push({});
    }

    if (typeof s.activePreset !== "number" || s.activePreset < 0 || s.activePreset >= MAX_PRESETS) {
        s.activePreset = 0;
    }
}

export function getActivePreset(): RpcPreset {
    const s = settings.store;
    if (Array.isArray(s.presets)) {
        return s.presets[s.activePreset ?? 0] ?? {};
    }
    return s;
}

export const refreshRpc = debounce(() => {
    setRpc(true);
    if (isPluginEnabled("CustomRPC")) {
        startTimestampLoop();
        setRpc();
    }
}, 500);

export function switchPreset(index: number) {
    const s = settings.store;
    if (!Array.isArray(s.presets)) ensurePresets();
    s.activePreset = index >= 0 && index < MAX_PRESETS ? index : 0;
    refreshRpc();
}

export function updatePresetValue<K extends keyof RpcPreset>(key: K, value: RpcPreset[K]) {
    const s = settings.store;
    if (!Array.isArray(s.presets)) ensurePresets();
    s.presets![s.activePreset ?? 0][key] = value;
    refreshRpc();
}

async function createActivity(): Promise<Activity | undefined> {
    const preset = getActivePreset();
    const {
        appID,
        appName,
        details,
        detailsURL,
        state,
        stateURL,
        type,
        streamLink,
        startTime,
        endTime,
        imageBig,
        imageBigURL,
        imageBigTooltip,
        imageSmall,
        imageSmallURL,
        imageSmallTooltip,
        buttonOneText,
        buttonOneURL,
        buttonTwoText,
        buttonTwoURL,
        partyMaxSize,
        partySize,
        timestampMode
    } = preset;

    if (!appName) return;

    const activity: Activity = {
        application_id: appID || "0",
        name: appName,
        state,
        details,
        type: type ?? ActivityType.PLAYING,
        flags: 1 << 0,
    };

    if (type === ActivityType.STREAMING) activity.url = streamLink;

    switch (timestampMode) {
        case TimestampMode.NOW:
            activity.timestamps = {
                start: Date.now()
            };
            break;
        case TimestampMode.TIME:
            activity.timestamps = {
                start: Date.now() - (new Date().setHours(0, 0, 0, 0))
            };
            break;
        case TimestampMode.CUSTOM:
            if (startTime || endTime) {
                activity.timestamps = {};
                if (startTime && endTime && endTime > startTime) {
                    const anchor = getLoopAnchor();
                    activity.timestamps.start = anchor;
                    activity.timestamps.end = anchor + (endTime - startTime);
                } else {
                    if (startTime) activity.timestamps.start = startTime;
                    if (endTime) activity.timestamps.end = endTime;
                }
            }
            break;
        case TimestampMode.NONE:
        default:
            break;
    }

    if (detailsURL) {
        activity.details_url = detailsURL;
    }

    if (stateURL) {
        activity.state_url = stateURL;
    }

    if (buttonOneText) {
        activity.buttons = [
            buttonOneText,
            buttonTwoText
        ].filter(isTruthy);

        activity.metadata = {
            button_urls: [
                buttonOneURL,
                buttonTwoURL
            ].filter(isTruthy)
        };
    }

    if (imageBig) {
        const asset = await getApplicationAsset(imageBig);
        if (asset) {
            activity.assets = {
                large_image: asset,
                large_text: imageBigTooltip || undefined,
                large_url: imageBigURL || undefined
            };
        }
    }

    if (imageSmall) {
        const asset = await getApplicationAsset(imageSmall);
        if (asset) {
            activity.assets = {
                ...activity.assets,
                small_image: asset,
                small_text: imageSmallTooltip || undefined,
                small_url: imageSmallURL || undefined
            };
        }
    }

    if (partyMaxSize && partySize) {
        activity.party = {
            size: [partySize, partyMaxSize]
        };
    }

    for (const k in activity) {
        if (k === "type") continue;
        const v = activity[k];
        if (!v || (Array.isArray(v) && v.length === 0))
            delete activity[k];
    }

    return activity;
}

export async function setRpc(disable?: boolean) {
    const activity: Activity | undefined = await createActivity();

    FluxDispatcher.dispatch({
        type: "LOCAL_ACTIVITY_UPDATE",
        activity: !disable ? activity : null,
        socketId: "CustomRPC",
    });
}

let loopInterval: ReturnType<typeof setInterval> | undefined;
let loopAnchor = 0;

function getLoopAnchor() {
    return loopAnchor;
}

export function startTimestampLoop() {
    stopTimestampLoop();

    const { timestampMode, startTime, endTime } = getActivePreset();
    if (timestampMode !== TimestampMode.CUSTOM || !startTime || !endTime) return;
    const duration = endTime - startTime;
    if (duration <= 0) return;

    loopAnchor = Date.now();

    loopInterval = setInterval(() => {

        if (Date.now() >= loopAnchor + duration) {
            loopAnchor = Date.now();
            setRpc();
        }
    }, 1000);
}

function stopTimestampLoop() {
    if (loopInterval !== undefined) {
        clearInterval(loopInterval);
        loopInterval = undefined;
    }
    loopAnchor = 0;
}

export default definePlugin({
    name: "CustomRPC",
    description: "Add a fully customisable Rich Presence (Game status) to your Discord profile",
    tags: ["Activity", "Customisation"],
    authors: [Devs.captain, Devs.AutumnVN, Devs.nin0dev, Devs.lucabeyer],
    dependencies: ["UserSettingsAPI"],
    // This plugin's patch is not important for functionality, so don't require a restart
    requiresRestart: false,
    settings,

    start() {
        ensurePresets();
        startTimestampLoop();
        setRpc();
    },
    stop() {
        setRpc(true);
        stopTimestampLoop();
    },

    // Discord hides buttons on your own Rich Presence for some reason. This patch disables that behaviour
    patches: [
        {
            find: ".USER_PROFILE_ACTIVITY_BUTTONS),",
            replacement: {
                match: /.getId\(\)===\i.id/,
                replace: "$& && false"
            },
        }
    ],

    settingsAboutComponent: () => {
        settings.use();
        const preset = getActivePreset();
        const [activity] = useAwaiter(createActivity, { fallbackValue: undefined, deps: [settings.store.activePreset, ...Object.values(preset)] });
        const gameActivityEnabled = ShowCurrentGame.useSetting();
        const { profileThemeStyle } = useProfileThemeStyle({});

        return (
            <>
                {!gameActivityEnabled && (
                    <ErrorCard
                        className={classes(Margins.top16, Margins.bottom16)}
                        style={{ padding: "1em" }}
                    >
                        <Heading>Notice</Heading>
                        <Paragraph>Activity Sharing isn't enabled, people won't be able to see your custom rich presence!</Paragraph>

                        <Button
                            variant="secondary"
                            className={Margins.top8}
                            onClick={() => ShowCurrentGame.updateSetting(true)}
                        >
                            Enable
                        </Button>
                    </ErrorCard>
                )}

                <Flex flexDirection="column" gap=".5em" className={Margins.top16}>
                    <Paragraph>
                        Go to the <Link href="https://discord.com/developers/applications">Discord Developer Portal</Link> to create an application and
                        get the application ID.
                    </Paragraph>
                    <Paragraph>
                        Upload images in the Rich Presence tab to get the image keys.
                    </Paragraph>
                    <Paragraph>
                        If you want to use an image link, download your image and reupload the image to <Link href="https://imgur.com">Imgur</Link> and get the image link by right-clicking the image and selecting "Copy image address".
                    </Paragraph>
                    <Paragraph>
                        You can't see your own buttons on your profile, but everyone else can see it fine.
                    </Paragraph>
                    <Paragraph>
                        Some weird unicode text ("fonts" 𝖑𝖎𝖐𝖊 𝖙𝖍𝖎𝖘) may cause the rich presence to not show up, try using normal letters instead.
                    </Paragraph>
                </Flex>

                <Divider className={Margins.top8} />

                <div style={{ width: "284px", ...profileThemeStyle, marginTop: 8, borderRadius: 8, background: "var(--background-mod-muted)" }}>
                    {activity && <ActivityView
                        activity={activity}
                        user={UserStore.getCurrentUser()}
                        currentUser={UserStore.getCurrentUser()}
                    />}
                </div>
            </>
        );
    }
});
