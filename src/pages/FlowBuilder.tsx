import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ReactFlow, Background, Controls, MiniMap, addEdge,
  useNodesState, useEdgesState, type Node, type Edge, type Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { toast } from 'sonner';
import { ArrowLeft, Save, MessageSquare, HelpCircle, GitBranch, Brain, UserRound, Play } from 'lucide-react';
import { db } from '../services/db';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';

type FlowNode = Node<{ text?: string; options?: string[]; label?: string; type?: string }, string>;

const NODE_TYPES = [
  { type: 'message', label: 'Message', icon: MessageSquare, color: '#38BDF8' },
  { type: 'question', label: 'Question', icon: HelpCircle, color: '#F5B13D' },
  { type: 'condition', label: 'Condition', icon: GitBranch, color: '#A78BFA' },
  { type: 'ai', label: 'AI (free)', icon: Brain, color: '#34D399' },
  { type: 'handoff', label: 'Handoff', icon: UserRound, color: '#F87171' },
] as const;

function makeNode(type: string, label: string, x: number, y: number): FlowNode {
  const t = NODE_TYPES.find((n) => n.type === type)!;
  return {
    id: `${type}-${Math.random().toString(36).slice(2, 7)}`,
    type: 'default',
    position: { x, y },
    data: { label: `• ${label}`, text: '', options: [], type },
    style: { border: `1.5px solid ${t.color}`, borderRadius: 10, background: 'var(--bg-tertiary)', color: 'var(--fg)', width: 190, fontFamily: 'var(--font-body)', fontSize: 13 },
  };
}

const nodeKind = (n: FlowNode) => {
  const kind = n.data?.type ?? n.id.split('-')[0];
  return ['message', 'question', 'condition', 'ai', 'handoff'].includes(kind) ? kind : 'ai';
};

export default function FlowBuilder() {
  const { botId } = useParams<{ botId: string }>();
  const navigate = useNavigate();
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!botId) return;
    db.getBot(botId).then((b) => {
      const flow = (b as unknown as Record<string, unknown>).flow as { nodes?: FlowNode[]; edges?: Edge[] } | null;
      if (flow?.nodes?.length) {
        setNodes(flow.nodes as FlowNode[]);
        setEdges(flow.edges ?? []);
      } else {
        // Starter flow
        setNodes([
          makeNode('message', 'Welcome message', 40, 120),
          makeNode('question', 'What do you need?', 320, 120),
          makeNode('ai', 'Free-form answer', 600, 60),
          makeNode('handoff', 'Escalate to human', 600, 220),
        ]);
        setEdges([
          { id: 'e1', source: 'message-1', target: 'question-1' },
          { id: 'e2', source: 'question-1', target: 'ai-1' },
          { id: 'e3', source: 'ai-1', target: 'handoff-1' },
        ]);
      }
      setLoaded(true);
    });
  }, [botId]);

  const onConnect = useCallback((c: Connection) => setEdges((eds) => addEdge({ ...c, id: `e-${Math.random().toString(36).slice(2, 7)}` }, eds)), [setEdges]);

  const addNode = (type: string, label: string) => {
    const offset = nodes.length * 24;
    setNodes((ns) => [...ns, makeNode(type, label, 320 + offset, 120 + offset)]);
  };

  const save = async () => {
    if (!botId) return;
    try {
      const clean = {
        nodes: nodes.map((n) => ({ id: n.id, type: 'default', position: n.position, data: { type: nodeKind(n), text: n.data?.text ?? '', options: n.data?.options ?? [] } })),
        edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
      };
      await db.saveFlow(botId, clean);
      toast.success('Flow saved — it now runs before free-form AI');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const simulate = () => {
    toast.info('Simulator: run a chat message in the bot chat to walk this flow deterministically.');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.9rem', flexWrap: 'wrap' }}>
        <button className="link-more" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }} onClick={() => navigate(`/bot/${botId}/edit`)}>
          <ArrowLeft style={{ width: 14, height: 14 }} /> Builder
        </button>
        <div>
          <div className="eyebrow">Visual flow builder</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.5rem' }}>Conversation flow</h1>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.6rem' }}>
          <Button variant="ghost" onClick={simulate}><Play /> Simulate</Button>
          <Button variant="primary" onClick={save}><Save /> Save flow</Button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.8rem', marginBottom: '0.9rem', flexWrap: 'wrap' }}>
        {NODE_TYPES.map((t) => (
          <Button key={t.type} variant="ghost" size="sm" onClick={() => addNode(t.type, t.label)}>
            <t.icon style={{ width: 14, height: 14, color: t.color }} /> {t.label}
          </Button>
        ))}
      </div>

      <Card style={{ flex: 1, minHeight: 420, padding: 0, overflow: 'hidden' }}>
        {loaded && (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            fitView
            nodeTypes={{}}
          >
            <Background color="rgba(255,255,255,0.06)" gap={20} />
            <Controls />
            <MiniMap style={{ background: 'var(--bg-secondary)' }} />
          </ReactFlow>
        )}
      </Card>
      <p className="mono" style={{ marginTop: '0.6rem', fontSize: '0.7rem', color: 'var(--fg-faint)' }}>
        Drag from a node's handle to connect. Message → text · Question → options · Condition → intent branch · AI → free-form fallback · Handoff → human agent.
      </p>
    </div>
  );
}
