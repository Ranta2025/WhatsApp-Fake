import React, { useState, useEffect } from 'react';
import { useDashboard } from '../context/DashboardContext';
import { useAuth } from '../../../context/AuthContext';

import SidebarHeader from './sidebar/SidebarHeader';
import SidebarSearch from './sidebar/SidebarSearch';
import SidebarTabs from './sidebar/SidebarTabs';
import ChatList from './sidebar/ChatList';
import CallListView from './sidebar/CallListView';
import StatusList from './sidebar/StatusList';
import ContactList from './sidebar/ContactList';
import GroupList from './sidebar/GroupList';

const Sidebar = ({ onOpenProfile, onAddContact, onCreateGroup, onCreateStatus }) => {
    const {
        contacts, onlineUsers, selected, setSelected,
        sidebarView, setSidebarView, sidebarOpen, setSidebarOpen,
        lastSeenMap, avatarMap, isConnected, myAvatar, profile,
        messagesByChat, allChatGroups, logout,
        groups, selectedGroup, setSelectedGroup,
        statusFeed, selectedStatusOwner, setSelectedStatusOwner,
    } = useDashboard();
    const { user } = useAuth();

    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const isContactOnline = (telephon) => onlineUsers.has(telephon);

    const getUnreadCount = (contact) => {
        const messages = messagesByChat[contact.Number] || [];
        return messages.filter(m => m && m.SenderTelephon === contact.Number && m.Status !== 'visto').length;
    };

    const formatLastMessage = (msg) => {
        if (!msg) return 'Sin mensajes';
        let mediaType = msg.MediaType;
        const text = msg.Message || '';
        
        if (!mediaType && text.includes('/media/')) {
            if (text.includes('/audio/')) mediaType = 'audio';
            else if (text.includes('/images/')) mediaType = 'image';
            else if (text.includes('/videos/')) mediaType = 'video';
            else if (text.includes('/docs/')) mediaType = 'document';
        }
        
        if (mediaType === 'audio') return 'Audio';
        if (mediaType === 'image') return 'Foto';
        if (mediaType === 'video') return 'Video';
        if (mediaType === 'document') return 'Documento';
        
        if (text.match(/^https?:\/\/.+\/media\/(images|audio|videos|docs)\//i)) {
            if (text.includes('/audio/')) return 'Audio';
            if (text.includes('/images/')) return 'Foto';
            if (text.includes('/videos/')) return 'Video';
            if (text.includes('/docs/')) return 'Documento';
            return 'Archivo adjunto';
        }
        if (text.match(/^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|mp4|webm|ogg|mp3|wav|pdf|doc|docx)(\?.*)?$/i)) {
            return 'Archivo adjunto';
        }
        
        return text;
    };

    return (
        <aside className={`
            min-w-0 bg-[#0B1120] border-r border-white/[0.04] flex flex-col
            ${(selected || selectedGroup || (sidebarView === 'statuses' && selectedStatusOwner)) ? 'hidden lg:flex lg:w-72 xl:w-80' : 'w-full lg:w-72 xl:w-80'}
        `}>
            <SidebarHeader
                profile={profile}
                myAvatar={myAvatar}
                isConnected={isConnected}
                onOpenProfile={onOpenProfile}
                logout={logout}
            />

            <SidebarSearch
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                sidebarView={sidebarView}
            />

            <SidebarTabs
                sidebarView={sidebarView}
                setSidebarView={setSidebarView}
            />

            <div className="flex-1 overflow-y-auto px-3 pb-4 pt-2 scrollbar-elegant">
                {sidebarView === 'chats' && (
                    <ChatList
                        debouncedSearchQuery={debouncedSearchQuery}
                        contacts={contacts}
                        messagesByChat={messagesByChat}
                        allChatGroups={allChatGroups}
                        selected={selected}
                        setSelected={setSelected}
                        avatarMap={avatarMap}
                        isContactOnline={isContactOnline}
                        getUnreadCount={getUnreadCount}
                        formatLastMessage={formatLastMessage}
                    />
                )}

                {sidebarView === 'calls' && (
                    <CallListView
                        contacts={contacts}
                        debouncedSearchQuery={debouncedSearchQuery}
                        setSelected={setSelected}
                    />
                )}

                {sidebarView === 'statuses' && (
                    <StatusList
                        debouncedSearchQuery={debouncedSearchQuery}
                        statusFeed={statusFeed}
                        selectedStatusOwner={selectedStatusOwner}
                        setSelectedStatusOwner={setSelectedStatusOwner}
                        setSidebarView={setSidebarView}
                        myAvatar={myAvatar}
                        onCreateStatus={onCreateStatus}
                    />
                )}

                {sidebarView === 'contacts' && (
                    <ContactList
                        debouncedSearchQuery={debouncedSearchQuery}
                        contacts={contacts}
                        selected={selected}
                        setSelected={setSelected}
                        avatarMap={avatarMap}
                        isContactOnline={isContactOnline}
                        lastSeenMap={lastSeenMap}
                        onAddContact={onAddContact}
                    />
                )}

                {sidebarView === 'groups' && (
                    <GroupList
                        debouncedSearchQuery={debouncedSearchQuery}
                        groups={groups}
                        selectedGroup={selectedGroup}
                        setSelectedGroup={setSelectedGroup}
                        setSidebarOpen={setSidebarOpen}
                        onCreateGroup={onCreateGroup}
                    />
                )}
            </div>
        </aside>
    );
};

export default Sidebar;
