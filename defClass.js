"use strict";
define(function(){

	var DEFCLASS_CONSTRUCTOR = {},
		MIXIN_TYPE_OBJECT = {},
		MIXIN_TYPE_PROTOTYPE = {},
		noop = function(){};

	function defClass(
		base,   // [constructor function; optional]
		mixins,	// [array of constructor functions and/or objects --or-- array of pairs of [name, constructor function or objects]; optional]
		members // [function --or-- object; required]
	){
		// juggle...
		if(!members){
			if(!mixins){
				// one argument...
				members = base;
				base = null;
				mixins = null;
			}else{
				// two arguments
				if(typeof base === "function"){
					// base and members
					members = mixins;
					mixins = null;
				}else{
					// mixins and members
					members = mixins;
					mixins = base;
					base = null;
				}
			}
		}

		// if mixins is not an array of pairs, then sift out the names and mixins
		var mixinNames = [];
		if(mixins && mixins.length && Array.isArray(mixins[0])){
			mixins = mixins.map(function(pair){
				mixinNames.push(pair[0]);
				return pair[1];
			})
		}

		// pull the prototypes of the mixins (if any)
		var mixinPrototypes = [],
			mixinTypes = [],
			pullNames = mixinNames.length == 0;
		if(mixins){
			mixins.forEach(function(mixin, mixinIndex){
				if(typeof mixin === "function"){
					mixinPrototypes.push(mixin.prototype);
					mixinTypes.push(MIXIN_TYPE_PROTOTYPE);
					if(pullNames){
						mixinNames.push(mixin.className || ("#" + mixinIndex));
					}
				}else{
					mixinPrototypes.push(mixin);
					mixinTypes.push(MIXIN_TYPE_OBJECT);
					if(pullNames){
						mixinNames.push((mixin.statics && mixin.statics.className) || ("#" + mixinIndex));
					}
				}
			});
		}

		// if members is a factory, then compute the members...
		var membersFactory = null;
		if(typeof members === "function"){
			membersFactory = members;
			members = membersFactory.apply(null, base ? [base.prototype].concat(mixinPrototypes) : mixinPrototypes);
		}

		// build the prototype
		var prototype = base ? Object.create(base.prototype) : {},
			seen = {},
			memberNames = Object.getOwnPropertyNames(members),
			ignoreNames = memberNames.reduce(
				function(result, value){
					result[value] = 1;
					return result;
				},
				{constructor: 1, statics: 1, defPrivate: 1}
			);
		mixinPrototypes.forEach(function(mixin, mixinIndex){
			var mixinType = mixinTypes[mixinIndex];
			Object.getOwnPropertyNames(mixin).forEach(function(name){
				if(!ignoreNames[name]){
					if(seen[name]){
						throw("mixin name clash: name=" + name + "; mixin " + seen[name] + " and mixin " + mixinNames[i - 1]);
					}else{
						seen[name] = mixinNames[mixinIndex];
					}
					if(typeof mixin[name] === "object" && mixinType === MIXIN_TYPE_OBJECT){
						Object.defineProperty(prototype, name, mixin[name]);
					}else{
						Object.defineProperty(prototype, name, Object.getOwnPropertyDescriptor(mixin, name));
					}
				}
			})
		});

		var statics = null,
			initializer = null;
		memberNames.forEach(function(name){
			if(name == "statics"){
				statics = members.statics;
			}else if(name == "constructor"){
				initializer = members.constructor;
			}else{
				// note: members is always a hash, never a prototype from another object
				if(typeof members[name] === "object"){
					Object.defineProperty(prototype, name, members[name]);
				}else{
					Object.defineProperty(prototype, name, Object.getOwnPropertyDescriptor(members, name));
				}
			}
		});

		if(!prototype.defPrivate){
			Object.defineProperty(prototype, "defPrivate", {
				value: function(name, value, getter, setter){
					var definition = {
						writable: true,
						value: value
					};
					if(getter){
						definition.get = getter
					}
					if(setter){
						definition.set = setter;
					}
					Object.defineProperty(this, name, definition);
				}
			});
		}

		//compute the initializers, if any
		var initializers = [];
		if(mixins){
			mixins.forEach(function(mixin){
				if(typeof mixin === "function"){
					// mixin is a constructor of some type
					if(mixin.constructorType === DEFCLASS_CONSTRUCTOR){
						mixin.initializer && initializers.push(mixin.initializer);
					}else{
						// a constructor of unknown origin...this is the best we can do
						initializers.push(mixin)
					}
				}else if(mixin.initializer){
					initializers.push(mixin.initializer)
				}else if(mixin.constructor){
					initializers.push(mixin.constructor)
				}
			});
		}

		// compute the initializer if a constructor wasn't provided in members
		if(!initializer){
			if(base){
				if(base.constructorType === DEFCLASS_CONSTRUCTOR){
					base.initializer && initializers.unshift(base.initializer);
				}else{
					base.initializer && initializers.unshift(base);
				}
			}
			var initializersCount = initializers.length;
			if(initializersCount == 1){
				initializer = initializers[0];
			}else if(initializersCount){
				initializer = function(){
					for(var i = 0; i < initializersCount;){
						initializers[i++].apply(this, arguments);
					}
				}
			}else{
				initializer = noop;
			}
		}

		// compute the constructor
		var constructor;
		if(initializer === noop){
			constructor = function(){
				if(this.constructor.prototype === prototype && this.postCreate){
					this.postCreate.apply(this, arguments);
				}
			}
		}else{
			constructor = function(){
				var result = initializer.apply(this, arguments);
				if(!result){
					result = this;
				}
				if(result.constructor.prototype === prototype && result.postCreate){
					result.postCreate.apply(result, arguments);
				}
				return result;
			}
		}
		constructor.prototype = prototype;
		prototype.constructor = constructor;


		// decorate the constructor

		// this is our marker to say that the constructor is a defClass-created constructor
		constructor.constructorType = DEFCLASS_CONSTRUCTOR;
		constructor.initializer = initializer;

		if(statics){
			Object.getOwnPropertyNames(statics).forEach(function(name){
				if(typeof statics[name] === "object"){
					Object.defineProperty(constructor, name, statics[name]);
				}else{
					Object.defineProperty(constructor, name, Object.getOwnPropertyDescriptor(statics, name));
				}
			});
		}
		if(!constructor.members){
			Object.defineProperty(constructor, "members", {enumerable: true, value: membersFactory || members});
		}
		if(!constructor.super && base){
			// therefore, this.constructor.super (this an instance of this class) points to the base prototype
			Object.defineProperty(constructor, "super", {enumerable: true, value: base.prototype});
		}
		if(!constructor.mixins && mixinNames.length){
			// therefore, this.constructor.mixin.A (this an instance of this class) points to the prototype/object of mixin with the name A
			var mixinsRef = {};
			mixinNames.forEach(function(name, i){
				if(name){
					mixinsRef[name] = mixinPrototypes[i];
				}
			});
			Object.defineProperty(constructor, "mixins", {enumerable: true, value: mixinsRef});
		}

		return constructor;
	}

	return defClass;
});
