"use client";
import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Initial sample user data
const initialUsers = [
  { id: 1, name: 'Alice Johnson', email: 'alice@example.com', status: 'Active' },
  { id: 2, name: 'Bob Smith', email: 'bob@example.com', status: 'Pending' },
  { id: 3, name: 'Charlie Brown', email: 'charlie@example.com', status: 'Inactive' },
  { id: 4, name: 'Diana Prince', email: 'diana@example.com', status: 'Active' },
];

export default function Home() {
  // Manage users and sheet state
  const [users, setUsers] = useState(initialUsers);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  // Dynamic statistics
  const totalUsers = users.length;
  const activeSessions = users.filter(u => u.status === 'Active').length;
  const newSignups = users.length - initialUsers.length;

  // Handlers
  const handleAddUser = () => {
    if (!newName.trim() || !newEmail.trim()) return;
    const newUser = {
      id: Date.now(),
      name: newName.trim(),
      email: newEmail.trim(),
      status: 'Active',
    };
    setUsers(prev => [...prev, newUser]);
    setNewName('');
    setNewEmail('');
    setIsOpen(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Dashboard</h1>
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild>
            <Button className="bg-blue-500 text-white hover:bg-blue-600">
              New User
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-full sm:w-96">
            <SheetHeader>
              <SheetTitle>Add New User</SheetTitle>
              <SheetDescription>
                Fill out the form below to create a new user.
              </SheetDescription>
            </SheetHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="name" className="text-right">
                  Name
                </Label>
                <Input
                  id="name"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="col-span-3"
                  placeholder="Jane Doe"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="email" className="text-right">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  className="col-span-3"
                  placeholder="jane@example.com"
                />
              </div>
            </div>
            <SheetFooter>
              <Button onClick={handleAddUser} className="w-full">
                Add User
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </div>

      {/* Statistic Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Card className="p-6">
          <h2 className="text-sm font-medium text-gray-500">Total Users</h2>
          <p className="mt-2 text-2xl font-semibold text-gray-900">
            {totalUsers}
          </p>
        </Card>
        <Card className="p-6">
          <h2 className="text-sm font-medium text-gray-500">Active Sessions</h2>
          <p className="mt-2 text-2xl font-semibold text-gray-900">
            {activeSessions}
          </p>
        </Card>
        <Card className="p-6">
          <h2 className="text-sm font-medium text-gray-500">New Signups</h2>
          <p className="mt-2 text-2xl font-semibold text-gray-900">
            {newSignups >= 0 ? newSignups : 0}
          </p>
        </Card>
      </div>

      {/* Data Table */}
      <Card className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                ID
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {users.map((user) => (
              <tr key={user.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                  {user.id}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                  {user.name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                  {user.email}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <span
                    className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      user.status === 'Active'
                        ? 'bg-green-100 text-green-800'
                        : user.status === 'Pending'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {user.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <Button className="text-blue-500 hover:underline bg-transparent p-0">
                    View
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}