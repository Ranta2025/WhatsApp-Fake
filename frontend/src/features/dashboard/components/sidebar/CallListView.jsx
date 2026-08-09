import React from 'react';
import CallHistory from '../../../../components/CallHistory';

const CallListView = ({ contacts, debouncedSearchQuery, setSelected }) => {
    return (
        <CallHistory
            contacts={contacts}
            searchQuery={debouncedSearchQuery}
            onSelectContact={(contact) => {
                setSelected(contact);
            }}
        />
    );
};

export default React.memo(CallListView);
