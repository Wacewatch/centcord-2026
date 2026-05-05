import React from 'react';

function Bar({ w = '100%', h = 12, className = '' }) {
  return <div className={`cc-skeleton ${className}`} style={{ width: w, height: h }} />;
}

export function ChannelListSkeleton({ rows = 6 }) {
  return (
    <div className="flex flex-col gap-1.5 p-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Bar key={i} w={`${60 + ((i * 13) % 35)}%`} h={20} />
      ))}
    </div>
  );
}

export function MessageListSkeleton({ rows = 6 }) {
  return (
    <div className="flex flex-col gap-4 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-3">
          <div className="cc-skeleton rounded-sm" style={{ width: 36, height: 36 }} />
          <div className="flex-1 flex flex-col gap-2">
            <Bar w={`${30 + ((i * 7) % 30)}%`} h={12} />
            <Bar w={`${50 + ((i * 11) % 40)}%`} h={14} />
            {i % 2 === 0 && <Bar w={`${30 + ((i * 9) % 50)}%`} h={14} />}
          </div>
        </div>
      ))}
    </div>
  );
}

export function MembersSidebarSkeleton({ rows = 8 }) {
  return (
    <div className="flex flex-col gap-2 p-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="cc-skeleton rounded-full" style={{ width: 28, height: 28 }} />
          <Bar w={`${50 + ((i * 11) % 30)}%`} h={12} />
        </div>
      ))}
    </div>
  );
}

export function ServerCardSkeleton() {
  return (
    <div className="border border-cc-border bg-cc-surface1 p-4 flex flex-col gap-3">
      <Bar w="60%" h={18} />
      <Bar w="100%" h={12} />
      <Bar w="80%" h={12} />
      <Bar w="40%" h={10} />
    </div>
  );
}
