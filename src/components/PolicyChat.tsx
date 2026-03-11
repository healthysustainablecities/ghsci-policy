import React from 'react';
import { createAIHooks, AIConversation } from '@aws-amplify/ui-react-ai';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';

interface PolicyChatProps {
  report: Schema["PolicyReport"]["type"];
  onClose: () => void;
}

const client = generateClient<Schema>({ authMode: 'userPool' });
const { useAIConversation } = createAIHooks(client);

export const PolicyChat: React.FC<PolicyChatProps> = ({ report, onClose }) => {
  // Format policy data for the AI
  const getPolicyContext = () => {
    if (!report.policyData) {
      return 'No policy data available for this report.';
    }

    try {
      let jsonData = report.policyData;
      
      // Parse if it's a string
      while (typeof jsonData === 'string') {
        try {
          jsonData = JSON.parse(jsonData);
        } catch {
          break;
        }
      }
      
      return `Policy Report for: ${report.fileName}

Policy Data:
${JSON.stringify(jsonData, null, 2)}

Please analyze this policy data and help me understand the strengths and gaps.`;
    } catch (error) {
      return `Policy Report for: ${report.fileName}\n\nError loading policy data.`;
    }
  };

  const [
    {
      data: { messages },
      isLoading,
      hasError,
    },
    handleSendMessage,
  ] = useAIConversation('policyChat');

  // Log any errors
  React.useEffect(() => {
    if (hasError) {
      console.error('AI Conversation Error - check AWS Bedrock configuration');
    }
  }, [hasError]);

  // Log when messages change
  React.useEffect(() => {
    console.log('Messages updated:', messages);
  }, [messages]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        className="modal-content" 
        onClick={(e) => e.stopPropagation()} 
        style={{ 
          maxWidth: '900px', 
          height: '85vh',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <div className="modal-header">
          <button onClick={onClose} className="btn btn-close">
            🗙
          </button>
          <h3>💬 AI Policy Analysis - {report.fileName}</h3>
        </div>
        
        {hasError && (
          <div style={{ 
            padding: '15px', 
            backgroundColor: '#f8d7da', 
            color: '#721c24', 
            borderRadius: '4px',
            margin: '20px',
            border: '1px solid #f5c6cb'
          }}>
            <strong>Error:</strong> Failed to connect to AI service. Please ensure AWS Bedrock is enabled in your region and you have requested access to Claude 3.5 Sonnet.
          </div>
        )}
        
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <AIConversation
            messages={messages}
            handleSendMessage={handleSendMessage}
            isLoading={isLoading}
            suggestedPrompts={[
              {
                inputText: 'Summarize my policy strengths and gaps',
                component: 'What are my policy strengths and gaps?',
              },
              {
                inputText: 'Which policy areas need the most improvement?',
                component: 'What needs improvement?',
              },
              {
                inputText: 'What policies are fully aligned and measurable?',
                component: 'Show me complete policies',
              },
              {
                inputText: getPolicyContext(),
                component: 'Analyze my policy data',
              },
            ]}
          />
        </div>
      </div>
    </div>
  );
};
