"use client";

import React, { useState, useEffect } from "react";

// Enhanced demo data with more variety
const demoData = [
  {
    id: 1,
    url: "https://example.com/flooring-kit",
    title: "Vinyl Flooring Kit",
    hashtags: ["camper van", "interior parts", "flooring", "diy", "easy install"],
    color: "brown",
    style: "classic",
    category: "flooring",
    price: 189.99,
    rating: 4.5,
    description: "Durable vinyl flooring designed for camper vans. This kit includes adhesive backing and pre-cut panels to fit common van layouts."
  },
  {
    id: 2,
    url: "https://example.com/roof-lights",
    title: "LED Roof Lights",
    hashtags: ["camper van", "interior parts", "lighting", "energy efficient", "modern"],
    color: "white",
    style: "modern",
    category: "lighting",
    price: 45.99,
    rating: 4.8,
    description: "Energy-efficient LED lights for van interiors. Low-profile fixtures with diffused lenses for even cabin illumination."
  },
  {
    id: 3,
    url: "https://example.com/insulation",
    title: "Thermal Insulation Roll",
    hashtags: ["camper van", "interior parts", "insulation", "thermal", "essential"],
    color: "silver",
    style: "utility",
    category: "insulation",
    price: 89.99,
    rating: 4.3,
    description: "High-grade insulation to maintain van temperature. Easy to cut and install between ribs and wall panels."
  },
  {
    id: 4,
    url: "https://example.com/kitchen-module",
    title: "Mini Kitchen Module",
    hashtags: ["camper van", "interior parts", "kitchen", "premium", "compact"],
    color: "gray",
    style: "premium",
    category: "kitchen",
    price: 599.99,
    rating: 4.9,
    description: "Compact kitchen module with sink and storage. Built-in water tank and optional stove mount for cooking on the go."
  },
  {
    id: 5,
    url: "https://example.com/solar-panel",
    title: "100W Solar Panel",
    hashtags: ["camper van", "exterior parts", "solar", "energy", "off-grid"],
    color: "black",
    style: "modern",
    category: "electrical",
    price: 129.99,
    rating: 4.7,
    description: "Lightweight solar panel for off-grid power. Perfect for charging batteries and running small appliances."
  },
  {
    id: 6,
    url: "https://example.com/roof-rack",
    title: "Aluminum Roof Rack",
    hashtags: ["camper van", "exterior parts", "storage", "heavy duty", "adventure"],
    color: "black",
    style: "utility",
    category: "exterior",
    price: 299.99,
    rating: 4.4,
    description: "Strong aluminum roof rack for additional storage. Carries kayaks, bikes, or storage boxes securely."
  },
  {
    id: 7,
    url: "https://example.com/swivel-seats",
    title: "Front Seat Swivels",
    hashtags: ["camper van", "interior parts", "seating", "comfort", "space saving"],
    color: "gray",
    style: "premium",
    category: "seating",
    price: 199.99,
    rating: 4.6,
    description: "Swivel bases for front seats to create living space. Easy installation with safety-certified mechanisms."
  },
  {
    id: 8,
    url: "https://example.com/window-covers",
    title: "Thermal Window Covers",
    hashtags: ["camper van", "interior parts", "privacy", "insulation", "custom fit"],
    color: "black",
    style: "modern",
    category: "windows",
    price: 79.99,
    rating: 4.2,
    description: "Custom-fit thermal window covers for privacy and temperature control. Reflective surface keeps van cool in summer."
  },
  {
    id: 9,
    url: "https://example.com/bed-platform",
    title: "Foldable Bed Platform",
    hashtags: ["camper van", "interior parts", "bed", "space saving", "multi functional"],
    color: "natural",
    style: "classic",
    category: "sleeping",
    price: 349.99,
    rating: 4.5,
    description: "Space-saving foldable bed platform with storage underneath. Converts from seating to sleeping area easily."
  },
  {
    id: 10,
    url: "https://example.com/water-system",
    title: "Compact Water System",
    hashtags: ["camper van", "interior parts", "plumbing", "kitchen", "essential"],
    color: "white",
    style: "utility",
    category: "plumbing",
    price: 159.99,
    rating: 4.3,
    description: "Complete water system with pump, tank, and faucet. Compact design perfect for small van kitchens."
  },
   {
    id: 11,
    url: "https://example.com/flooring-kit",
    title: "Flooring Kit",
    hashtags: ["camper van", "interior parts", "flooring", "diy", "easy install"],
    color: "brown",
    style: "classic",
    category: "flooring",
    price: 189.99,
    rating: 4.5,
    description: "Durable vinyl flooring designed for camper vans. This kit includes adhesive backing and pre-cut panels to fit common van layouts."
  },
  {
    id: 21,
    url: "https://example.com/roof-lights",
    title: "Roof Lights",
    hashtags: ["camper van", "interior parts", "lighting", "energy efficient", "modern"],
    color: "white",
    style: "modern",
    category: "lighting",
    price: 45.99,
    rating: 4.8,
    description: "Energy-efficient LED lights for van interiors. Low-profile fixtures with diffused lenses for even cabin illumination."
  },
  {
    id: 31,
    url: "https://example.com/insulation",
    title: "Insulation Roll",
    hashtags: ["camper van", "interior parts", "insulation", "thermal", "essential"],
    color: "silver",
    style: "utility",
    category: "insulation",
    price: 89.99,
    rating: 4.3,
    description: "High-grade insulation to maintain van temperature. Easy to cut and install between ribs and wall panels."
  },
  {
    id: 41,
    url: "https://example.com/kitchen-module",
    title: "Kitchen Module",
    hashtags: ["camper van", "interior parts", "kitchen", "premium", "compact"],
    color: "gray",
    style: "premium",
    category: "kitchen",
    price: 599.99,
    rating: 4.9,
    description: "Compact kitchen module with sink and storage. Built-in water tank and optional stove mount for cooking on the go."
  },
  {
    id: 51,
    url: "https://example.com/solar-panel",
    title: "Solar Panel",
    hashtags: ["camper van", "exterior parts", "solar", "energy", "off-grid"],
    color: "black",
    style: "modern",
    category: "electrical",
    price: 129.99,
    rating: 4.7,
    description: "Lightweight solar panel for off-grid power. Perfect for charging batteries and running small appliances."
  },
  {
    id: 61,
    url: "https://example.com/roof-rack",
    title: "Roof Rack",
    hashtags: ["camper van", "exterior parts", "storage", "heavy duty", "adventure"],
    color: "black",
    style: "utility",
    category: "exterior",
    price: 299.99,
    rating: 4.4,
    description: "Strong aluminum roof rack for additional storage. Carries kayaks, bikes, or storage boxes securely."
  },
  {
    id: 71,
    url: "https://example.com/swivel-seats",
    title: "Seat Swivels",
    hashtags: ["camper van", "interior parts", "seating", "comfort", "space saving"],
    color: "gray",
    style: "premium",
    category: "seating",
    price: 199.99,
    rating: 4.6,
    description: "Swivel bases for front seats to create living space. Easy installation with safety-certified mechanisms."
  },
  {
    id: 81,
    url: "https://example.com/window-covers",
    title: "Window Covers",
    hashtags: ["camper van", "interior parts", "privacy", "insulation", "custom fit"],
    color: "black",
    style: "modern",
    category: "windows",
    price: 79.99,
    rating: 4.2,
    description: "Custom-fit thermal window covers for privacy and temperature control. Reflective surface keeps van cool in summer."
  },
  {
    id: 91,
    url: "https://example.com/bed-platform",
    title: "Bed Platform",
    hashtags: ["camper van", "interior parts", "bed", "space saving", "multi functional"],
    color: "natural",
    style: "classic",
    category: "sleeping",
    price: 349.99,
    rating: 4.5,
    description: "Space-saving foldable bed platform with storage underneath. Converts from seating to sleeping area easily."
  },
  {
    id: 101,
    url: "https://example.com/water-system",
    title: "Water System",
    hashtags: ["camper van", "interior parts", "plumbing", "kitchen", "essential"],
    color: "white",
    style: "utility",
    category: "plumbing",
    price: 159.99,
    rating: 4.3,
    description: "Complete water system with pump, tank, and faucet. Compact design perfect for small van kitchens."
  }
];

export default function FilterTable({ data = demoData }) {
  const [filters, setFilters] = useState({
    hashtags: {},
    colors: {},
    styles: {},
    categories: {}
  });

  const [searchTerm, setSearchTerm] = useState("");
  const [priceRange, setPriceRange] = useState([0, 1000]);
  const [allHashtags, setAllHashtags] = useState([]);
  const [allColors, setAllColors] = useState([]);
  const [allStyles, setAllStyles] = useState([]);
  const [allCategories, setAllCategories] = useState([]);
  const [filteredData, setFilteredData] = useState(data || []);
  const [activeFilterSection, setActiveFilterSection] = useState("hashtags");
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  // Extract all unique values for filters
  useEffect(() => {
    const uniqueHashtags = new Set();
    const uniqueColors = new Set();
    const uniqueStyles = new Set();
    const uniqueCategories = new Set();

    (data || []).forEach((item) => {
      item.hashtags?.forEach((h) => uniqueHashtags.add(h));
      if (item.color) uniqueColors.add(item.color);
      if (item.style) uniqueStyles.add(item.style);
      if (item.category) uniqueCategories.add(item.category);
    });

    setAllHashtags(Array.from(uniqueHashtags));
    setAllColors(Array.from(uniqueColors));
    setAllStyles(Array.from(uniqueStyles));
    setAllCategories(Array.from(uniqueCategories));

    // Set max price for range
    const maxPrice = Math.max(...data.map(item => item.price || 0));
    setPriceRange([0, maxPrice]);
  }, [data]);

  const toggleFilter = (type, value) => {
    setFilters((prev) => ({
      ...prev,
      [type]: {
        ...prev[type],
        [value]: !prev[type][value]
      }
    }));
  };

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Apply all filters and sorting
  useEffect(() => {
    if (!data) {
      setFilteredData([]);
      return;
    }

    let result = [...data];

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(item =>
        item.title.toLowerCase().includes(term) ||
        item.description.toLowerCase().includes(term) ||
        item.hashtags.some(tag => tag.toLowerCase().includes(term))
      );
    }

    // Price filter
    result = result.filter(item =>
      item.price >= priceRange[0] && item.price <= priceRange[1]
    );

    // Hashtag filters
    const activeHashtags = Object.keys(filters.hashtags).filter(t => filters.hashtags[t]);
    if (activeHashtags.length > 0) {
      result = result.filter(item =>
        activeHashtags.every(tag => item.hashtags.includes(tag))
      );
    }

    // Color filters
    const activeColors = Object.keys(filters.colors).filter(c => filters.colors[c]);
    if (activeColors.length > 0) {
      result = result.filter(item => activeColors.includes(item.color));
    }

    // Style filters
    const activeStyles = Object.keys(filters.styles).filter(s => filters.styles[s]);
    if (activeStyles.length > 0) {
      result = result.filter(item => activeStyles.includes(item.style));
    }

    // Category filters
    const activeCategories = Object.keys(filters.categories).filter(c => filters.categories[c]);
    if (activeCategories.length > 0) {
      result = result.filter(item => activeCategories.includes(item.category));
    }

    // Sorting
    if (sortConfig.key) {
      result.sort((a, b) => {
        if (a[sortConfig.key] < b[sortConfig.key]) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (a[sortConfig.key] > b[sortConfig.key]) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }

    setFilteredData(result);
  }, [filters, searchTerm, priceRange, data, sortConfig]);

  const clearAllFilters = () => {
    setFilters({ hashtags: {}, colors: {}, styles: {}, categories: {} });
    setSearchTerm("");
    setPriceRange([0, Math.max(...data.map(item => item.price || 0))]);
    setSortConfig({ key: null, direction: 'asc' });
  };

  const getActiveFilterCount = () => {
    return (
      Object.keys(filters.hashtags).filter(t => filters.hashtags[t]).length +
      Object.keys(filters.colors).filter(c => filters.colors[c]).length +
      Object.keys(filters.styles).filter(s => filters.styles[s]).length +
      Object.keys(filters.categories).filter(c => filters.categories[c]).length
    );
  };

  const FilterSection = ({ title, type, items, active, icon }) => (
    <div className={`p-4 rounded-xl transition-all duration-200 ${
      active ? 'bg-white border-2 border-blue-500 shadow-lg' : 'bg-gray-50 border border-gray-200 hover:border-gray-300'
    }`}>
      <h3
        className="font-semibold mb-3 cursor-pointer flex justify-between items-center text-gray-800"
        onClick={() => setActiveFilterSection(activeFilterSection === type ? '' : type)}
      >
        <span className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          {title}
        </span>
        <span className="text-sm font-normal text-gray-500 bg-white w-6 h-6 rounded-full flex items-center justify-center">
          {activeFilterSection === type ? '−' : '+'}
        </span>
      </h3>

      {activeFilterSection === type && (
        <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
          {items.map((item) => (
            <label key={item} className="flex items-center gap-3 p-2 rounded-lg hover:bg-blue-50 transition-colors cursor-pointer group">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={!!filters[type]?.[item]}
                  onChange={() => toggleFilter(type, item)}
                  className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2 cursor-pointer"
                />
              </div>
              <span className="text-sm text-gray-700 group-hover:text-gray-900 capitalize">
                {type === 'colors' && (
                  <span
                    className="w-3 h-3 rounded-full inline-block mr-2 border border-gray-300"
                    style={{
                      backgroundColor:
                        item === 'white' ? '#f8fafc' :
                        item === 'black' ? '#1f2937' :
                        item === 'silver' ? '#e5e7eb' :
                        item === 'gray' ? '#6b7280' :
                        item === 'brown' ? '#92400e' :
                        item === 'natural' ? '#fef3c7' : item
                    }}
                  />
                )}
                {item}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">VanLife Parts Catalog</h1>
          <p className="text-gray-600 text-lg">Find the perfect parts for your camper van conversion</p>
        </div>

        {/* Search and Controls */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
            <div className="flex-1 w-full">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  type="text"
                  placeholder="Search products, descriptions, or features..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <div className="flex items-center gap-2 bg-blue-50 px-3 py-2 rounded-lg">
                <span className="text-sm text-blue-700 font-medium">
                  {getActiveFilterCount()} active
                </span>
              </div>
              <button
                onClick={clearAllFilters}
                className="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-600 hover:to-blue-700 transition-all duration-200 shadow-md hover:shadow-lg font-medium flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Reset Filters
              </button>
            </div>
          </div>

          {/* Price Range Filter */}
          <div className="mt-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                <span>💰</span>
                Price Range
              </h3>
              <span className="text-sm font-medium text-blue-600 bg-blue-100 px-3 py-1 rounded-full">
                ${priceRange[0]} - ${priceRange[1]}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600 font-medium">${priceRange[0]}</span>
              <input
                type="range"
                min="0"
                max={Math.max(...data.map(item => item.price || 0))}
                value={priceRange[1]}
                onChange={(e) => setPriceRange([priceRange[0], parseInt(e.target.value)])}
                className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
              />
              <span className="text-sm text-gray-600 font-medium">${priceRange[1]}</span>
            </div>
          </div>
        </div>

        {/* Filter Sections */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <FilterSection
            title="Hashtags"
            type="hashtags"
            items={allHashtags}
            active={activeFilterSection === 'hashtags'}
            icon="🏷️"
          />
          <FilterSection
            title="Colors"
            type="colors"
            items={allColors}
            active={activeFilterSection === 'colors'}
            icon="🎨"
          />
          <FilterSection
            title="Styles"
            type="styles"
            items={allStyles}
            active={activeFilterSection === 'styles'}
            icon="✨"
          />
          <FilterSection
            title="Categories"
            type="categories"
            items={allCategories}
            active={activeFilterSection === 'categories'}
            icon="📦"
          />
        </div>

        {/* Results Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-white px-4 py-2 rounded-xl shadow-sm border border-gray-200">
              <span className="text-gray-700 font-medium">
                Found <span className="text-blue-600 font-bold">{filteredData.length}</span> of <span className="text-gray-900">{data.length}</span> products
              </span>
            </div>
          </div>

          {filteredData.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span>Click column headers to sort</span>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          {filteredData.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200">
                    {[
                      { key: 'title', label: 'Product' },
                      { key: 'price', label: 'Price' },
                      { key: 'rating', label: 'Rating' },
                      { key: 'url', label: 'Link' },
                      { key: 'hashtags', label: 'Tags' },
                      { key: 'color', label: 'Color' },
                      { key: 'style', label: 'Style' },
                      { key: 'category', label: 'Category' },
                      { key: 'description', label: 'Description' }
                    ].map(({ key, label }) => (
                      <th
                        key={key}
                        onClick={() => handleSort(key)}
                        className="p-4 text-left font-semibold text-gray-700 cursor-pointer hover:bg-gray-200 transition-colors group"
                      >
                        <div className="flex items-center gap-2">
                          {label}
                          <span className="text-gray-400 group-hover:text-gray-600">
                            {sortConfig.key === key ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredData.map((item) => (
                    <tr key={item.id} className="hover:bg-blue-50 transition-all duration-200 group">
                      <td className="p-4">
                        <div className="font-semibold text-gray-900 group-hover:text-blue-700">{item.title}</div>
                      </td>
                      <td className="p-4">
                        <span className="font-bold text-green-600 text-lg">${item.price}</span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1 bg-yellow-50 px-2 py-1 rounded-full">
                            <span className="text-yellow-500">⭐</span>
                            <span className="font-semibold text-gray-700">{item.rating}</span>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium transition-colors"
                        >
                          <span>View</span>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-wrap gap-1">
                          {item.hashtags.map((tag, index) => (
                            <span
                              key={index}
                              className="inline-block bg-gradient-to-r from-blue-100 to-blue-50 text-blue-700 text-xs px-2 py-1 rounded-full border border-blue-200"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-4 h-4 rounded-full border-2 border-white shadow-sm"
                            style={{
                              backgroundColor:
                                item.color === 'white' ? '#f8fafc' :
                                item.color === 'black' ? '#1f2937' :
                                item.color === 'silver' ? '#e5e7eb' :
                                item.color === 'gray' ? '#6b7280' :
                                item.color === 'brown' ? '#92400e' :
                                item.color === 'natural' ? '#fef3c7' : item.color
                            }}
                          />
                          <span className="capitalize font-medium text-gray-700">{item.color}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="capitalize bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-sm font-medium">
                          {item.style}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className="capitalize bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-medium">
                          {item.category}
                        </span>
                      </td>
                      <td className="p-4">
                        <p className="text-gray-600 text-sm leading-relaxed">{item.description}</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-16">
              <div className="max-w-md mx-auto">
                <div className="w-24 h-24 mx-auto mb-4 bg-gradient-to-r from-blue-100 to-purple-100 rounded-full flex items-center justify-center">
                  <span className="text-3xl">🔍</span>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No products found</h3>
                <p className="text-gray-600 mb-6">Try adjusting your filters or search terms</p>
                <button
                  onClick={clearAllFilters}
                  className="px-8 py-3 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-xl hover:from-blue-600 hover:to-purple-600 transition-all duration-200 shadow-lg font-semibold"
                >
                  Clear All Filters
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-gray-500 text-sm">
          <p>VanLife Parts Catalog • {new Date().getFullYear()} • Built with ❤️ for adventurers</p>
        </div>
      </div>

      <style jsx>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: linear-gradient(135deg, #3b82f6, #1d4ed8);
          cursor: pointer;
          border: 2px solid white;
          box-shadow: 0 2px 6px rgba(0,0,0,0.2);
        }

        .slider::-moz-range-thumb {
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: linear-gradient(135deg, #3b82f6, #1d4ed8);
          cursor: pointer;
          border: 2px solid white;
          box-shadow: 0 2px 6px rgba(0,0,0,0.2);
        }

        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }

        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f5f9;
          border-radius: 10px;
        }

        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 10px;
        }

        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
      `}</style>
    </div>
  );
}