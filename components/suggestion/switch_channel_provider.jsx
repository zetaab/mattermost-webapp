// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See License.txt for license information.

import React from 'react';
import {Client4} from 'mattermost-redux/client';
import {Preferences} from 'mattermost-redux/constants';
import {getChannelsInCurrentTeam, getGroupChannels, getMyChannelMemberships} from 'mattermost-redux/selectors/entities/channels';
import {getBool} from 'mattermost-redux/selectors/entities/preferences';
import {getCurrentTeamId} from 'mattermost-redux/selectors/entities/teams';
import {getCurrentUserId, searchProfiles, getUserIdsInChannels, getUser} from 'mattermost-redux/selectors/entities/users';

import {browserHistory} from 'utils/browser_history';
import GlobeIcon from 'components/svg/globe_icon';
import LockIcon from 'components/svg/lock_icon';
import AppDispatcher from 'dispatcher/app_dispatcher.jsx';
import store from 'stores/redux_store.jsx';
import {getChannelDisplayName, sortChannelsByDisplayName} from 'utils/channel_utils.jsx';
import {ActionTypes, Constants} from 'utils/constants.jsx';
import * as Utils from 'utils/utils.jsx';
import * as AdminConsoleIndex from 'utils/admin_console_index';
import * as UiActionsIndex from 'utils/ui_actions_index';
import {renderShortcut} from 'components/shortcuts_modal.jsx';

import Provider from './provider.jsx';
import Suggestion from './suggestion.jsx';

const getState = store.getState;

export class SwitchChannelSuggestion extends Suggestion {
    handleClick = (e) => {
        const {item, term, matchedPretext} = this.props;
        e.preventDefault();

        if (item.type === Constants.SUGGESTION_ADMIN_CONSOLE) {
            browserHistory.push(AdminConsoleIndex.mappingSectionsToTexts[item.key].url);
        } else if (item.type === Constants.SUGGESTION_UI_ACTIONS) {
            const selectedItem = UiActionsIndex.mappingSectionsToTexts[item.key]
            if (selectedItem.action) {
                store.dispatch(selectedItem.action)
            } else {
                selectedItem.func();
            }
            AppDispatcher.handleViewAction({type: ActionTypes.TOGGLE_QUICK_SWITCH_MODAL});
        } else {
            this.props.onClick(term, matchedPretext);
        }
    }

    render() {
        const {item, isSelection} = this.props;
        const channel = item.channel;

        let className = 'mentions__name spotlight-item';
        if (isSelection) {
            className += ' suggestion--selected';
        }

        let displayName = channel.display_name;
        let icon = null;
        if (item.type === Constants.SUGGESTION_ADMIN_CONSOLE) {
            icon = (
                <i
                    className='category-icon fa fa-gear'
                    style={{padding: '0 10px 0 0'}}
                />
            );
            displayName = item.name;
        } else if (item.type === Constants.SUGGESTION_UI_ACTIONS) {
            const selectedItem = UiActionsIndex.mappingSectionsToTexts[item.key]
            if (selectedItem.icon && typeof selectedItem.icon !== 'string') {
                const IconClass = selectedItem.icon
                icon = (
                    <IconClass className='spotlight' />
                );
            } else if (selectedItem.icon && typeof selectedItem.icon === 'string') {
                icon = (
                    <i
                        className={'category-icon fa '+selectedItem.icon}
                        style={{padding: '0 10px 0 0'}}
                    />
                );
            } else {
                icon = (
                    <i
                        className='category-icon fa fa-exclamation'
                        style={{padding: '0 10px 0 0'}}
                    />
                );
            }
            if (item.name.indexOf('\t') !== -1) {
                displayName = renderShortcut(item.name);
            } else {
                displayName = item.name;
            }
        } else if (channel.type === Constants.OPEN_CHANNEL) {
            icon = (
                <GlobeIcon className='icon icon__globe icon--body'/>
            );
        } else if (channel.type === Constants.PRIVATE_CHANNEL) {
            icon = (
                <LockIcon className='icon icon__lock icon--body'/>
            );
        } else if (channel.type === Constants.GM_CHANNEL) {
            displayName = getChannelDisplayName(channel);
            icon = <div className='status status--group'>{'G'}</div>;
        } else {
            icon = (
                <div className='pull-left'>
                    <img
                        className='mention__image'
                        src={Utils.imageURLForUser(channel)}
                    />
                </div>
            );
        }

        return (
            <div
                onClick={this.handleClick}
                className={className}
            >
                {icon}
                {displayName}
            </div>
        );
    }
}

let prefix = '';

function quickSwitchSorter(wrappedA, wrappedB) {
    if (wrappedA.type === Constants.SUGGESTION_ADMIN_CONSOLE && wrappedB.type === Constants.SUGGESTION_ADMIN_CONSOLE) {
        return wrappedA.name > wrappedB.name;
    }
    if (wrappedA.type === Constants.SUGGESTION_ADMIN_CONSOLE) {
        return 1;
    }
    if (wrappedB.type === Constants.SUGGESTION_ADMIN_CONSOLE) {
        return -1;
    }

    if (wrappedA.type === Constants.SUGGESTION_UI_ACTIONS) {
        return 1;
    }
    if (wrappedB.type === Constants.SUGGESTION_UI_ACTIONS) {
        return -1;
    }

    if (wrappedA.type === Constants.MENTION_CHANNELS && wrappedB.type === Constants.MENTION_MORE_CHANNELS) {
        return -1;
    } else if (wrappedB.type === Constants.MENTION_CHANNELS && wrappedA.type === Constants.MENTION_MORE_CHANNELS) {
        return 1;
    }

    if (wrappedA.deactivated && !wrappedB.deactivated) {
        return 1;
    } else if (wrappedB.deactivated && !wrappedA.deactivated) {
        return -1;
    }

    const a = wrappedA.channel;
    const b = wrappedB.channel;

    let aDisplayName = getChannelDisplayName(a).toLowerCase();
    let bDisplayName = getChannelDisplayName(b).toLowerCase();

    if (a.type === Constants.DM_CHANNEL) {
        aDisplayName = aDisplayName.substring(1);
    }

    if (b.type === Constants.DM_CHANNEL) {
        bDisplayName = bDisplayName.substring(1);
    }

    const aStartsWith = aDisplayName.startsWith(prefix);
    const bStartsWith = bDisplayName.startsWith(prefix);
    if (aStartsWith && bStartsWith) {
        return sortChannelsByDisplayName(a, b);
    } else if (!aStartsWith && !bStartsWith) {
        return sortChannelsByDisplayName(a, b);
    } else if (aStartsWith) {
        return -1;
    }

    return 1;
}

function makeChannelSearchFilter(channelPrefix) {
    const channelPrefixLower = channelPrefix.toLowerCase();
    const curState = getState();
    const usersInChannels = getUserIdsInChannels(curState);
    const userSearchStrings = {};

    return (channel) => {
        let searchString = channel.display_name;

        if (channel.type === Constants.GM_CHANNEL || channel.type === Constants.DM_CHANNEL) {
            const usersInChannel = usersInChannels[channel.id] || [];
            for (const userId of usersInChannel) {
                let userString = userSearchStrings[userId];

                if (!userString) {
                    const user = getUser(curState, userId);
                    if (!user) {
                        continue;
                    }
                    const {nickname, username} = user;
                    userString = `${nickname}${username}${Utils.getFullName(user)}`;
                    userSearchStrings[userId] = userString;
                }
                searchString += userString;
            }
        }

        return searchString.toLowerCase().includes(channelPrefixLower);
    };
}

export default class SwitchChannelProvider extends Provider {
    constructor(intl) {
        super();
        this.intl = intl;
        this.admin_console_index = AdminConsoleIndex.generateIndex(intl);
        this.ui_actions_index = UiActionsIndex.generateIndex(intl);
    }
    handlePretextChanged(suggestionId, channelPrefix) {
        if (channelPrefix) {
            prefix = channelPrefix;
            this.startNewRequest(suggestionId, channelPrefix);

            // Dispatch suggestions for local data
            const channels = getChannelsInCurrentTeam(getState()).concat(getGroupChannels(getState()));
            let users;
            if (channelPrefix[0] === "~") {
                users = [];
            } else if (channelPrefix[0] === "@") {
                users = Object.assign([], searchProfiles(getState(), channelPrefix.substring(1), true));
            } else {
                users = Object.assign([], searchProfiles(getState(), channelPrefix, true));
            }
            this.formatChannelsAndDispatch(channelPrefix, suggestionId, channels, users, true);

            // Fetch data from the server and dispatch
            this.fetchUsersAndChannels(channelPrefix, suggestionId);

            return true;
        }

        return false;
    }

    async fetchUsersAndChannels(channelPrefix, suggestionId) {
        const teamId = getCurrentTeamId(getState());
        if (!teamId) {
            return;
        }

        let usersAsync;
        if (channelPrefix[0] === "~" || channelPrefix[0] === ">") {
        } else if (channelPrefix[0] === "@") {
            if (global.window.mm_config.RestrictDirectMessage === 'team') {
                usersAsync = Client4.autocompleteUsers(channelPrefix.substring(1), teamId, '');
            } else {
                usersAsync = Client4.autocompleteUsers(channelPrefix.substring(1), '', '');
            }
        } else {
            if (global.window.mm_config.RestrictDirectMessage === 'team') {
                usersAsync = Client4.autocompleteUsers(channelPrefix, teamId, '');
            } else {
                usersAsync = Client4.autocompleteUsers(channelPrefix, '', '');
            }
        }

        let channelsAsync;
        if (channelPrefix[0] === "~") {
            channelsAsync = Client4.searchChannels(teamId, channelPrefix.substring(1));
        } else {
            channelsAsync = Client4.searchChannels(teamId, channelPrefix);
        }

        let usersFromServer = [];
        let channelsFromServer = [];
        try {
            usersFromServer = await usersAsync;
            channelsFromServer = await channelsAsync;
        } catch (err) {
            AppDispatcher.handleServerAction({
                type: ActionTypes.RECEIVED_ERROR,
                err,
            });
        }

        if (this.shouldCancelDispatch(channelPrefix)) {
            return;
        }

        let users;
        if (channelPrefix[0] === "~" || channelPrefix[0] === ">") {
            users = [];
        } else if (channelPrefix[0] === "@") {
            users = Object.assign([], searchProfiles(getState(), channelPrefix.substring(1), true)).concat(usersFromServer.users);
        } else {
            users = Object.assign([], searchProfiles(getState(), channelPrefix, true)).concat(usersFromServer.users);
        }
        const channels = getChannelsInCurrentTeam(getState()).concat(getGroupChannels(getState())).concat(channelsFromServer);
        this.formatChannelsAndDispatch(channelPrefix, suggestionId, channels, users);
    }

    formatChannelsAndDispatch(channelPrefix, suggestionId, allChannels, users, skipNotInChannel = false) {
        const channels = [];

        const members = getMyChannelMemberships(getState());

        if (channelPrefix[0] === "~") {
            if (this.shouldCancelDispatch(channelPrefix.substring(1))) {
                return;
            }
        } else {
            if (this.shouldCancelDispatch(channelPrefix)) {
                return;
            }
        }

        const currentId = getCurrentUserId(getState());

        const completedChannels = {};

        let channelFilter;
        if (channelPrefix[0] === "~") {
            channelFilter = makeChannelSearchFilter(channelPrefix.substring(1));
        } else {
            channelFilter = makeChannelSearchFilter(channelPrefix);
        }

        for (const id of Object.keys(allChannels)) {
            if (channelPrefix[0] === "@" || channelPrefix[0] === ">") {
                continue
            }
            const channel = allChannels[id];

            if (completedChannels[channel.id]) {
                continue;
            }

            if (channelFilter(channel)) {
                const newChannel = Object.assign({}, channel);
                const wrappedChannel = {channel: newChannel, name: newChannel.name, deactivated: false};
                if (newChannel.type === Constants.GM_CHANNEL) {
                    newChannel.name = getChannelDisplayName(newChannel);
                    wrappedChannel.name = newChannel.name;
                    const isGMVisible = getBool(getState(), Preferences.CATEGORY_GROUP_CHANNEL_SHOW, newChannel.id, false);
                    if (isGMVisible) {
                        wrappedChannel.type = Constants.MENTION_CHANNELS;
                    } else {
                        wrappedChannel.type = Constants.MENTION_MORE_CHANNELS;
                        if (skipNotInChannel) {
                            continue;
                        }
                    }
                } else if (members[channel.id]) {
                    wrappedChannel.type = Constants.MENTION_CHANNELS;
                } else {
                    wrappedChannel.type = Constants.MENTION_MORE_CHANNELS;
                    if (channelPrefix[0] === "~") {
                        if (skipNotInChannel || !newChannel.display_name.toLowerCase().startsWith(channelPrefix.substring(1))) {
                            continue;
                        }
                    } else {
                        if (skipNotInChannel || !newChannel.display_name.toLowerCase().startsWith(channelPrefix)) {
                            continue;
                        }
                    }
                }

                completedChannels[channel.id] = true;
                channels.push(wrappedChannel);
            }
        }

        for (let i = 0; i < users.length; i++) {
            const user = users[i];

            if (completedChannels[user.id]) {
                continue;
            }

            const isDMVisible = getBool(getState(), Preferences.CATEGORY_DIRECT_CHANNEL_SHOW, user.id, false);
            let displayName = `@${user.username}`;

            if (user.id === currentId) {
                continue;
            }

            if ((user.first_name || user.last_name) && user.nickname) {
                displayName += ` - ${Utils.getFullName(user)} (${user.nickname})`;
            } else if (user.nickname) {
                displayName += ` - (${user.nickname})`;
            } else if (user.first_name || user.last_name) {
                displayName += ` - ${Utils.getFullName(user)}`;
            }

            if (user.delete_at) {
                displayName += ' - ' + Utils.localizeMessage('channel_switch_modal.deactivated', 'Deactivated');
            }

            const wrappedChannel = {
                channel: {
                    display_name: displayName,
                    name: user.username,
                    id: user.id,
                    update_at: user.update_at,
                    type: Constants.DM_CHANNEL,
                    last_picture_update: user.last_picture_update || 0,
                },
                name: user.username,
                deactivated: user.delete_at,
            };

            if (isDMVisible) {
                wrappedChannel.type = Constants.MENTION_CHANNELS;
            } else {
                wrappedChannel.type = Constants.MENTION_MORE_CHANNELS;
                if (skipNotInChannel) {
                    continue;
                }
            }

            completedChannels[user.id] = true;
            channels.push(wrappedChannel);
        }

        // Suggestions for admin console pages
        if (channelPrefix[0] !== "~" && channelPrefix[0] !== "@") {
            let query = '';
            if (channelPrefix[0] === ">") {
                for (const term of channelPrefix.substring(1).split(' ')) {
                    term.trim();
                    if (term != '') {
                        query += term + ' ';
                        query += term + '* ';
                    }
                }
            } else {
                for (const term of channelPrefix.split(' ')) {
                    term.trim();
                    if (term != '') {
                        query += term + ' ';
                        query += term + '* ';
                    }
                }
            }
            this.admin_console_index.search(query).map((result) => {
                const name = this.intl.formatMessage({id: 'admin.section.' + result.ref});
                channels.push({
                    type: Constants.SUGGESTION_ADMIN_CONSOLE,
                    channel: {
                        display_name: '',
                        name,
                        id: '',
                        update_at: 0,
                        type: Constants.DM_CHANNEL,
                        last_picture_update: 0,
                    },
                    name,
                    key: result.ref,
                    score: result.score,
                    deactivated: null,
                });
            });

            this.ui_actions_index.search(query).map((result) => {
                const name = this.intl.formatMessage({id: UiActionsIndex.mappingSectionsToTexts[result.ref].text});
                channels.push({
                    type: Constants.SUGGESTION_UI_ACTIONS,
                    channel: {
                        display_name: '',
                        name,
                        id: '',
                        update_at: 0,
                        type: Constants.DM_CHANNEL,
                        last_picture_update: 0,
                    },
                    name,
                    key: result.ref,
                    score: result.score,
                    deactivated: null,
                });
            });
        }

        const channelNames = channels.
            sort(quickSwitchSorter).
            map((wrappedChannel) => wrappedChannel.channel.name);

        if (skipNotInChannel) {
            channels.push({
                type: Constants.MENTION_MORE_CHANNELS,
                loading: true,
            });
        }

        setTimeout(() => {
            AppDispatcher.handleServerAction({
                type: ActionTypes.SUGGESTION_RECEIVED_SUGGESTIONS,
                id: suggestionId,
                matchedPretext: channelPrefix,
                terms: channelNames,
                items: channels,
                component: SwitchChannelSuggestion,
            });
        }, 0);
    }
}
