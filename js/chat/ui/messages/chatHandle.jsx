var React = require("react");
var ContactsUI = require('./../contacts.jsx');
var ConversationMessageMixin = require('./mixin.jsx').ConversationMessageMixin;
import { Emoji } from '../../../ui/utils';

class ChatHandleMessage extends ConversationMessageMixin {
    render() {
        var self = this;
        var cssClasses = "message body";

        var message = this.props.message;
        var contact = self.getContact();
        var timestampInt = self.getTimestamp();
        var timestamp = self.getTimestampAsString();


        var datetime = <div className="message date-time"
                                       title={time2date(timestampInt)}>{timestamp}</div>;

        var displayName;
        if (contact) {
            displayName = generateAvatarMeta(contact.u).fullName;
        }
        else {
            displayName = contact;
        }

        var avatar = null;
        if (this.props.grouped) {
            cssClasses += " grouped";
        }
        else {
            avatar = <ContactsUI.Avatar
                contact={contact}
                className="message  avatar-wrapper small-rounded-avatar"
                chatRoom={this.props.chatRoom}
            />;
            datetime = <div className="message date-time"
                title={time2date(timestampInt)}>{timestamp}</div>;
        }


        return (
            <div className={cssClasses} data-id={"id" + message.messageId} key={message.messageId}>
                {avatar}

                <div className="message content-area small-info-txt selectable-txt">
                    <div className="message user-card-name">
                        <Emoji>{displayName}</Emoji>
                    </div>
                    {datetime}

                    <div className="message text-block">
                        {(message.meta.handleUpdate === 1) ? l[20570] : l[20571]}
                    </div>
                </div>
            </div>
        );
    }
};

export {
    ChatHandleMessage
};
